"""
GitHub Repository Explainer - Backend
Fetches a public GitHub repo's structure + README, sends it to Groq's free
LLM API, and returns a structured architecture explanation + Mermaid diagram.
"""
import os
import re
import json
import base64
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
# The issue solver's prompts include real file content and are much larger
# than the repo-explainer's — llama-3.3-70b's free tier TPM (12,000) chokes
# on that. 8b-instant has a far higher free-tier token ceiling and is plenty
# capable for "insert this fix into this file" style tasks.
GROQ_MODEL_ISSUE = os.getenv("GROQ_MODEL_ISSUE", "llama-3.1-8b-instant")

GITHUB_API = "https://api.github.com"
GROQ_API = "https://api.groq.com/openai/v1/chat/completions"

# Files worth reading in full to understand the stack/architecture
INTERESTING_FILES = [
    "package.json", "requirements.txt", "pyproject.toml", "Cargo.toml",
    "go.mod", "pom.xml", "build.gradle", "Gemfile", "composer.json",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "tsconfig.json", "next.config.js", "vite.config.ts", "vite.config.js",
]

MAX_TREE_ENTRIES = 400          # cap how many paths we send to the LLM
MAX_FILE_CHARS = 3000           # cap per-file content sent to the LLM (repo overview / README)
MAX_ISSUE_FILE_CHARS = 6000     # cap for full file content shown when solving an issue

app = FastAPI(title="GitHub Repository Explainer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    repo_url: str


def parse_repo_url(repo_url: str) -> tuple[str, str]:
    """Extract (owner, repo) from a GitHub URL or 'owner/repo' shorthand."""
    repo_url = repo_url.strip().rstrip("/")
    repo_url = re.sub(r"\.git$", "", repo_url)

    m = re.search(r"github\.com[/:]([^/]+)/([^/]+)", repo_url)
    if m:
        return m.group(1), m.group(2)

    m = re.match(r"^([^/\s]+)/([^/\s]+)$", repo_url)
    if m:
        return m.group(1), m.group(2)

    raise HTTPException(status_code=400, detail="Could not parse a GitHub owner/repo from that input.")


def gh_headers() -> dict:
    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return headers


async def gh_get(client: httpx.AsyncClient, url: str, **kwargs):
    resp = await client.get(url, headers=gh_headers(), **kwargs)
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Repository not found (is it public?).")
    if resp.status_code == 403:
        raise HTTPException(
            status_code=403,
            detail="GitHub API rate limit hit. Add a GITHUB_TOKEN in your .env to raise the limit.",
        )
    resp.raise_for_status()
    return resp


async def gh_call(client: httpx.AsyncClient, method: str, url: str, **kwargs):
    """Generic GitHub API call for write operations (POST/PUT), used by the
    issue-solver's branch-create / commit / open-PR flow. Raises a readable
    HTTPException with GitHub's own error message on failure."""
    resp = await client.request(method, url, headers=gh_headers(), **kwargs)
    if resp.status_code in (200, 201):
        return resp
    try:
        gh_message = resp.json().get("message", resp.text[:300])
    except Exception:
        gh_message = resp.text[:300]

    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="GitHub rejected the token. Check GITHUB_TOKEN in .env.")
    if resp.status_code == 403:
        raise HTTPException(
            status_code=403,
            detail=f"GitHub refused this action (likely missing 'repo' write scope on your token): {gh_message}",
        )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Not found: {gh_message}")
    if resp.status_code == 422:
        raise HTTPException(status_code=422, detail=f"GitHub validation error: {gh_message}")
    raise HTTPException(status_code=502, detail=f"GitHub API error ({resp.status_code}): {gh_message}")


async def fetch_repo_data(owner: str, repo: str) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as client:
        repo_resp = await gh_get(client, f"{GITHUB_API}/repos/{owner}/{repo}")
        repo_info = repo_resp.json()
        default_branch = repo_info.get("default_branch", "main")

        tree_resp = await gh_get(
            client,
            f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{default_branch}",
            params={"recursive": "1"},
        )
        tree = tree_resp.json().get("tree", [])
        file_paths = [t["path"] for t in tree if t.get("type") == "blob"]

        # README
        readme_text = ""
        try:
            readme_resp = await gh_get(client, f"{GITHUB_API}/repos/{owner}/{repo}/readme")
            readme_json = readme_resp.json()
            content = readme_json.get("content", "")
            if content:
                readme_text = base64.b64decode(content).decode("utf-8", errors="ignore")[:MAX_FILE_CHARS]
        except HTTPException:
            pass

        # Key manifest / config files present in this repo
        present_key_files = [p for p in file_paths if os.path.basename(p) in INTERESTING_FILES]
        key_file_contents = {}
        for path in present_key_files[:8]:
            try:
                file_resp = await gh_get(
                    client, f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}"
                )
                fjson = file_resp.json()
                content = fjson.get("content", "")
                if content:
                    key_file_contents[path] = base64.b64decode(content).decode(
                        "utf-8", errors="ignore"
                    )[:MAX_FILE_CHARS]
            except HTTPException:
                continue

        # Language breakdown (bytes per language) — powers the GitHub-style language bar
        languages: dict = {}
        try:
            lang_resp = await gh_get(client, f"{GITHUB_API}/repos/{owner}/{repo}/languages")
            languages = lang_resp.json()
        except HTTPException:
            pass

        return {
            "info": repo_info,
            "file_paths": file_paths[:MAX_TREE_ENTRIES],
            "readme": readme_text,
            "key_files": key_file_contents,
            "languages": languages,
        }


def build_prompt(owner: str, repo: str, data: dict) -> list[dict]:
    info = data["info"]
    tree_listing = "\n".join(data["file_paths"])
    key_files_block = "\n\n".join(
        f"--- {path} ---\n{content}" for path, content in data["key_files"].items()
    ) or "(none found)"

    system_prompt = (
        "You are a principal software engineer who explains unfamiliar codebases "
        "quickly and precisely to other engineers. You always respond with STRICT JSON "
        "matching the requested schema, and nothing else — no markdown fences, no prose "
        "outside the JSON."
    )

    user_prompt = f"""Analyze this GitHub repository and explain its architecture.

Repository: {owner}/{repo}
Description: {info.get('description') or 'N/A'}
Primary language: {info.get('language') or 'N/A'}
Stars: {info.get('stargazers_count', 0)}

FILE TREE (may be truncated):
{tree_listing}

README (may be truncated):
{data['readme'] or '(no README found)'}

KEY CONFIG / MANIFEST FILES:
{key_files_block}

Respond with ONLY a JSON object with this exact schema:
{{
  "summary": "2-3 sentence plain-English summary of what this project does",
  "tech_stack": ["list", "of", "languages/frameworks/tools", "actually used"],
  "architecture_style": "short label, e.g. 'monolithic REST API', 'microservices', 'CLI tool', 'React SPA + serverless backend'",
  "key_components": [
    {{"name": "component or folder name", "purpose": "one sentence on what it does"}}
  ],
  "entry_points": ["file paths where execution starts, e.g. main.py, src/index.ts"],
  "architecture_explanation": "A clear 3-5 paragraph explanation of how the pieces fit together, written for a developer seeing this repo for the first time.",
  "mermaid_diagram": "A valid Mermaid.js flowchart, see strict rules below"
}}

STRICT RULES for "mermaid_diagram" (Mermaid syntax errors will break rendering, follow these exactly):
1. Start with "flowchart TD" on its own first line.
2. Every node must have a short alphanumeric ID with no spaces (A, B, UserAuth, DB1) followed by its label in square brackets, e.g. A[User Interface].
3. Node labels: plain words and spaces ONLY. NEVER use parentheses (), colons :, quotes ' or ", ampersands &, or slashes / inside a label. Write "Database" not "Database (SQLite)". Write "Auth and Session" not "Auth/Session".
4. Edges use exactly this format: A --> B  or  A -->|label text| B. Edge labels follow the same plain-text rule as node labels — no punctuation.
5. Do not use subgraphs, styling (style/classDef), click events, or comments (%%). Keep it a plain flowchart of nodes and arrows only.
6. Keep it to 6-12 nodes maximum — one node per major component, not per file.
7. Output raw Mermaid text only inside the JSON string value, with \\n between lines. No markdown code fences.

Example of a CORRECT mermaid_diagram value:
"flowchart TD\\nA[Client Browser] --> B[Django Views]\\nB --> C[URL Router]\\nC --> D[QPaperGeneration App]\\nD --> E[SQLite Database]\\nD --> F[ReportLab PDF Engine]\\nB --> G[Templates]"
"""

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def parse_issue_url(issue_url: str) -> tuple[str, str, int]:
    """Extract (owner, repo, issue_number) from a GitHub issue URL."""
    issue_url = issue_url.strip()
    m = re.search(r"github\.com/([^/]+)/([^/]+)/issues/(\d+)", issue_url)
    if m:
        return m.group(1), m.group(2), int(m.group(3))
    raise HTTPException(
        status_code=400,
        detail="Could not parse a GitHub issue URL. Expected format: https://github.com/owner/repo/issues/123",
    )


async def fetch_issue(owner: str, repo: str, issue_number: int) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await gh_get(client, f"{GITHUB_API}/repos/{owner}/{repo}/issues/{issue_number}")
        issue = resp.json()
        if "pull_request" in issue:
            raise HTTPException(status_code=400, detail="That URL points to a pull request, not an issue.")
        return {
            "number": issue.get("number"),
            "title": issue.get("title", ""),
            "body": (issue.get("body") or "")[:MAX_FILE_CHARS],
            "labels": [l.get("name") for l in issue.get("labels", [])],
            "html_url": issue.get("html_url"),
        }


async def fetch_referenced_files(owner: str, repo: str, issue: dict, file_paths: list[str]) -> dict:
    """Finds files whose name is mentioned in the issue title/body and fetches
    their FULL content, so the model can ground a 'modify' in the real file
    instead of guessing — the root cause of truncated/destructive edits."""
    haystack = f"{issue['title']} {issue['body']}".lower()
    candidates = []
    for path in file_paths:
        basename = os.path.basename(path).lower()
        if len(basename) > 3 and basename in haystack:
            candidates.append(path)
    candidates = candidates[:2]  # keep prompt size sane

    referenced: dict = {}
    async with httpx.AsyncClient(timeout=20.0) as client:
        for path in candidates:
            try:
                resp = await gh_get(client, f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}")
                j = resp.json()
                content_b64 = j.get("content")
                if not content_b64 and j.get("sha"):
                    blob = await gh_get(client, f"{GITHUB_API}/repos/{owner}/{repo}/git/blobs/{j['sha']}")
                    content_b64 = blob.json().get("content", "")
                text = base64.b64decode(content_b64 or "").decode("utf-8", errors="ignore")
                referenced[path] = text[:MAX_ISSUE_FILE_CHARS]
            except (HTTPException, UnicodeDecodeError):
                continue
    return referenced


def validate_file_changes(file_changes: list[dict], referenced_files: dict) -> tuple[list[dict], list[str]]:
    """Drops any 'modify' whose generated content looks truncated relative to
    the real original — catches the '# rest of the file...' failure mode
    before it ever reaches a commit. Returns (safe_changes, warnings)."""
    truncation_markers = re.compile(
        r"(#|//|/\*|<!--)\s*(rest of|remaining|existing code|unchanged|previous code|\.\.\.\s*$)",
        re.IGNORECASE | re.MULTILINE,
    )
    safe_changes = []
    warnings = []

    for fc in file_changes:
        path = fc.get("path", "")
        content = fc.get("content", "") or ""
        action = fc.get("action", "")
        original = referenced_files.get(path)

        if action == "modify" and original:
            too_short = len(content) < len(original) * 0.6 and len(original) > 400
            has_marker = bool(truncation_markers.search(content))
            if too_short or has_marker:
                warnings.append(
                    f"Dropped a proposed change to '{path}' — it looked truncated "
                    f"(the model wrote a placeholder instead of the full file) rather "
                    f"than risk overwriting it with incomplete content. Try re-running "
                    f"the analysis, or edit this file yourself using the plan above."
                )
                continue

        safe_changes.append(fc)

    return safe_changes, warnings


def build_issue_prompt(owner: str, repo: str, issue: dict, repo_data: dict, referenced_files: dict) -> list[dict]:
    tree_listing = "\n".join(repo_data["file_paths"][:150])
    key_files_block = "\n\n".join(
        f"--- {path} ---\n{content[:800]}" for path, content in list(repo_data["key_files"].items())[:4]
    ) or "(none found)"

    referenced_block = "\n\n".join(
        f"--- {path} (FULL CURRENT CONTENT — {len(content)} chars) ---\n{content}"
        for path, content in referenced_files.items()
    ) or "(none of the files mentioned by name in the issue could be fetched — if you need to modify a specific existing file you don't see here, say so in 'summary' instead of guessing its content)"

    system_prompt = (
        "You are a senior software engineer who reads GitHub issues, plans a fix, "
        "and writes the actual code changes. You always respond with STRICT JSON "
        "matching the requested schema, and nothing else — no markdown fences, no "
        "prose outside the JSON. You are conservative: you only touch files you're "
        "reasonably confident about, and you write complete, working file contents, "
        "never partial diffs or placeholders like '...rest of file'."
    )

    user_prompt = f"""An engineer needs help resolving this GitHub issue.

Repository: {owner}/{repo}
Issue #{issue['number']}: {issue['title']}
Labels: {', '.join(issue['labels']) or 'none'}

ISSUE BODY:
{issue['body'] or '(no description provided)'}

REPOSITORY FILE TREE (may be truncated):
{tree_listing}

README (may be truncated):
{(repo_data['readme'] or '(no README found)')[:1000]}

KEY CONFIG / MANIFEST FILES:
{key_files_block}

FULL CONTENT OF FILES NAMED IN THE ISSUE (use these as ground truth if you modify them):
{referenced_block}

Respond with ONLY a JSON object with this exact schema:
{{
  "summary": "2-3 sentences on what's actually wrong / requested and your approach",
  "plan": ["Step 1 description", "Step 2 description", "..."],
  "file_changes": [
    {{
      "path": "relative/path/to/file.ext",
      "action": "create or modify",
      "content": "The COMPLETE file content after your change — the full file, not a diff or snippet"
    }}
  ],
  "pr_title": "Concise conventional-commit-style PR title, e.g. 'fix: handle null user on login'",
  "pr_body": "2-4 sentence PR description explaining the change and referencing 'Closes #{issue['number']}'"
}}

RULES:
1. Limit file_changes to at most 3 files — the smallest change that plausibly resolves the issue.
2. If you're not confident a change is correct without seeing more of the codebase, say so honestly in "summary" and keep file_changes minimal or empty rather than guessing destructively.
3. Never invent files unrelated to the issue.
4. "content" must be the ENTIRE resulting file — anyone applying it will overwrite the file with exactly this text.
5. CRITICAL for "modify": if the file appears in "FULL CONTENT OF FILES NAMED IN THE ISSUE" above, your "content" must start from that EXACT original text, character for character, with ONLY your specific fix inserted or changed — copy every unrelated line as-is. NEVER write a placeholder like "# rest of the file...", "// unchanged", or similar — doing so deletes real code when applied and is treated as a critical failure. If the file is too long for you to safely reproduce in full, do NOT include it in file_changes at all; explain the limitation in "summary" instead."""

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def sanitize_mermaid(raw: str) -> str:
    """
    Best-effort cleanup of LLM-generated Mermaid syntax. Strips characters
    inside node/edge labels that commonly break Mermaid's parser, even
    though the prompt already asks the model to avoid them.
    """
    if not raw:
        return raw

    text = raw.strip()
    # Model sometimes wraps in a markdown fence despite instructions
    text = re.sub(r"^```(?:mermaid)?\s*|\s*```$", "", text.strip())
    # Normalize literal backslash-n (can happen with double-escaped JSON)
    text = text.replace("\\n", "\n")

    lines = [ln for ln in text.split("\n") if ln.strip()]
    if not lines:
        return raw

    # Ensure a valid diagram-type header
    if not re.match(r"^\s*(flowchart|graph)\s+(TD|LR|TB|RL|BT)\s*$", lines[0], re.I):
        lines.insert(0, "flowchart TD")

    cleaned = [lines[0]]
    for line in lines[1:]:
        # Drop comments/style/subgraph directives — the frontend theme handles styling
        if re.match(r"^\s*(%%|style|classDef|class|click|subgraph|end)\b", line, re.I):
            continue

        def strip_label_punct(m: "re.Match") -> str:
            inner = re.sub(r"[():'\"&/]", "", m.group(1))
            inner = re.sub(r"\s{2,}", " ", inner).strip()
            return f"[{inner}]"

        line = re.sub(r"\[([^\[\]]*)\]", strip_label_punct, line)

        def strip_edge_label(m: "re.Match") -> str:
            inner = re.sub(r"[():'\"&/]", "", m.group(1))
            return f"|{inner.strip()}|"

        line = re.sub(r"\|([^|]*)\|", strip_edge_label, line)
        cleaned.append(line)

    return "\n".join(cleaned)


async def call_groq(messages: list[dict], model: str = GROQ_MODEL) -> dict:
    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Server is missing GROQ_API_KEY. Add it to backend/.env (get a free key at console.groq.com/keys).",
        )
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            GROQ_API,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Groq API error: {resp.text[:300]}")
        payload = resp.json()

    raw_text = payload["choices"][0]["message"]["content"]
    raw_text = re.sub(r"^```json\s*|\s*```$", "", raw_text.strip())
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Model returned invalid JSON. Try again.")


@app.get("/api/health")
async def health():
    return {"status": "ok", "groq_configured": bool(GROQ_API_KEY)}


class RegenerateDiagramRequest(BaseModel):
    architecture_explanation: str
    key_components: list[dict] = []


@app.post("/api/regenerate-diagram")
async def regenerate_diagram(req: RegenerateDiagramRequest):
    """Cheap follow-up call that asks for just a fresh Mermaid diagram,
    used by the frontend's 'regenerate' button when rendering fails."""
    components_list = "\n".join(
        f"- {c.get('name', '')}: {c.get('purpose', '')}" for c in req.key_components
    )
    messages = [
        {
            "role": "system",
            "content": (
                "You output ONLY a raw Mermaid.js flowchart, nothing else — "
                "no JSON, no markdown fences, no prose."
            ),
        },
        {
            "role": "user",
            "content": f"""Based on this architecture description, produce a Mermaid flowchart.

ARCHITECTURE:
{req.architecture_explanation}

KEY COMPONENTS:
{components_list or '(none listed)'}

STRICT RULES:
1. Start with "flowchart TD" on its own first line.
2. Node IDs: short alphanumeric, no spaces. Labels in square brackets: A[Label Text].
3. Labels: plain words and spaces ONLY — no parentheses, colons, quotes, ampersands, or slashes.
4. Edges: A --> B  or  A -->|label| B, same plain-text rule for edge labels.
5. No subgraphs, no styling, no comments. 6-12 nodes max.
6. Output raw Mermaid text only, real newlines, nothing else in your response.""",
        },
    ]
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="Server is missing GROQ_API_KEY.")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            GROQ_API,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={"model": GROQ_MODEL, "messages": messages, "temperature": 0.1},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Groq API error: {resp.text[:300]}")
        raw = resp.json()["choices"][0]["message"]["content"]

    return {"mermaid_diagram": sanitize_mermaid(raw)}


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    owner, repo = parse_repo_url(req.repo_url)
    data = await fetch_repo_data(owner, repo)
    messages = build_prompt(owner, repo, data)
    analysis = await call_groq(messages)

    if "mermaid_diagram" in analysis:
        analysis["mermaid_diagram"] = sanitize_mermaid(analysis["mermaid_diagram"])

    langs = data.get("languages") or {}
    total_bytes = sum(langs.values()) or 1
    language_breakdown = [
        {"name": name, "percent": round((count / total_bytes) * 100, 1)}
        for name, count in sorted(langs.items(), key=lambda kv: kv[1], reverse=True)
    ][:6]

    return {
        "owner": owner,
        "repo": repo,
        "stars": data["info"].get("stargazers_count", 0),
        "language": data["info"].get("language"),
        "description": data["info"].get("description"),
        "file_count": len(data["file_paths"]),
        "file_paths": data["file_paths"],
        "default_branch": data["info"].get("default_branch", "main"),
        "language_breakdown": language_breakdown,
        "analysis": analysis,
    }


class IssueAnalyzeRequest(BaseModel):
    issue_url: str


@app.post("/api/analyze-issue")
async def analyze_issue(req: IssueAnalyzeRequest):
    owner, repo, issue_number = parse_issue_url(req.issue_url)
    issue = await fetch_issue(owner, repo, issue_number)
    repo_data = await fetch_repo_data(owner, repo)
    referenced_files = await fetch_referenced_files(owner, repo, issue, repo_data["file_paths"])
    messages = build_issue_prompt(owner, repo, issue, repo_data, referenced_files)
    result = await call_groq(messages, model=GROQ_MODEL_ISSUE)

    safe_changes, warnings = validate_file_changes(result.get("file_changes", []), referenced_files)
    result["file_changes"] = safe_changes
    if warnings:
        result["summary"] = result.get("summary", "") + "\n\n⚠️ " + " ".join(warnings)

    return {
        "owner": owner,
        "repo": repo,
        "issue": issue,
        "default_branch": repo_data["info"].get("default_branch", "main"),
        "result": result,
    }


class FileChange(BaseModel):
    path: str
    action: str
    content: str


class CreatePRRequest(BaseModel):
    owner: str
    repo: str
    base_branch: str
    branch_name: str
    pr_title: str
    pr_body: str = ""
    file_changes: list[FileChange]


@app.post("/api/create-pr")
async def create_pr(req: CreatePRRequest):
    """Creates a real branch, commits the given file changes to it, and opens
    a real pull request. Requires GITHUB_TOKEN to have 'repo' write scope and
    the token owner to have write access to the target repository."""
    if not req.file_changes:
        raise HTTPException(status_code=400, detail="No file changes to commit.")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Get the SHA of the base branch's latest commit
        try:
            ref_resp = await gh_call(
                client, "GET",
                f"{GITHUB_API}/repos/{req.owner}/{req.repo}/git/ref/heads/{req.base_branch}",
            )
        except HTTPException as e:
            raise HTTPException(
                status_code=e.status_code,
                detail=f"[Step 1: reading base branch '{req.base_branch}'] {e.detail}",
            )
        base_sha = ref_resp.json()["object"]["sha"]

        # 2. Create the new branch pointing at that commit — if it already exists
        # (e.g. a retry after an earlier step failed last time), just reuse it
        # rather than erroring, so retries with the same branch name work.
        try:
            await gh_call(
                client, "POST",
                f"{GITHUB_API}/repos/{req.owner}/{req.repo}/git/refs",
                json={"ref": f"refs/heads/{req.branch_name}", "sha": base_sha},
            )
        except HTTPException as e:
            if e.status_code == 422 and "already exists" in (e.detail or "").lower():
                pass  # branch already exists — proceed and commit onto it
            else:
                raise HTTPException(
                    status_code=e.status_code,
                    detail=f"[Step 2: creating branch '{req.branch_name}'] {e.detail}",
                )

        # 3. Commit each file change to the new branch
        for fc in req.file_changes:
            existing_sha: Optional[str] = None
            if fc.action == "modify":
                try:
                    existing_resp = await gh_call(
                        client, "GET",
                        f"{GITHUB_API}/repos/{req.owner}/{req.repo}/contents/{fc.path}",
                        params={"ref": req.branch_name},
                    )
                    existing_sha = existing_resp.json().get("sha")
                except HTTPException:
                    pass  # file doesn't exist yet — will be created instead

            commit_body = {
                "message": f"{fc.action}: {fc.path}",
                "content": base64.b64encode(fc.content.encode("utf-8")).decode("ascii"),
                "branch": req.branch_name,
            }
            if existing_sha:
                commit_body["sha"] = existing_sha

            try:
                await gh_call(
                    client, "PUT",
                    f"{GITHUB_API}/repos/{req.owner}/{req.repo}/contents/{fc.path}",
                    json=commit_body,
                )
            except HTTPException as e:
                raise HTTPException(
                    status_code=e.status_code,
                    detail=f"[Step 3: committing '{fc.path}'] {e.detail}",
                )

        # 4. Open the pull request — if one already exists for this branch
        # (also possible on a retry), fetch and return that instead of failing.
        try:
            pr_resp = await gh_call(
                client, "POST",
                f"{GITHUB_API}/repos/{req.owner}/{req.repo}/pulls",
                json={
                    "title": req.pr_title,
                    "head": req.branch_name,
                    "base": req.base_branch,
                    "body": req.pr_body,
                },
            )
            pr_json = pr_resp.json()
        except HTTPException as e:
            if e.status_code == 422 and "already exists" in (e.detail or "").lower():
                existing = await gh_call(
                    client, "GET",
                    f"{GITHUB_API}/repos/{req.owner}/{req.repo}/pulls",
                    params={"head": f"{req.owner}:{req.branch_name}", "state": "open"},
                )
                results = existing.json()
                pr_json = results[0] if results else {}
            else:
                raise HTTPException(
                    status_code=e.status_code,
                    detail=f"[Step 4: opening the pull request] {e.detail}",
                )

    return {"pr_url": pr_json.get("html_url"), "branch_name": req.branch_name}


class FileContentRequest(BaseModel):
    owner: str
    repo: str
    path: str
    ref: Optional[str] = None


@app.post("/api/file-content")
async def file_content(req: FileContentRequest):
    """Fetches a single file's text content for the code viewer, GitHub-blob-style."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        params = {"ref": req.ref} if req.ref else {}
        resp = await gh_call(
            client, "GET",
            f"{GITHUB_API}/repos/{req.owner}/{req.repo}/contents/{req.path}",
            params=params,
        )
        j = resp.json()
        if isinstance(j, list):
            raise HTTPException(status_code=400, detail="That path is a directory, not a file.")

        content_b64 = j.get("content")
        sha = j.get("sha")

        if not content_b64 and sha:
            # Files over 1MB omit "content" from the contents API — fall back to the blob API
            blob_resp = await gh_call(client, "GET", f"{GITHUB_API}/repos/{req.owner}/{req.repo}/git/blobs/{sha}")
            content_b64 = blob_resp.json().get("content", "")

        try:
            text = base64.b64decode(content_b64 or "").decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status_code=415, detail="This file isn't text (likely binary) and can't be displayed.")

        return {"path": req.path, "content": text, "sha": sha, "size": j.get("size", len(text))}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import MermaidDiagram from "../MermaidDiagram";
import CodeViewerModal from "../CodeViewerModal";
import type { AnalyzeResponse, ApiError } from "../types";
import { languageColor } from "../languageColors";

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [viewerPath, setViewerPath] = useState<string | null>(null);

  // Matches a Key Component's display name (e.g. "Project.py" or "app.py")
  // to a real path in the scanned file tree, so we know it's clickable and
  // exactly what to fetch. Returns null for folders / no confident match.
  const findFilePath = useCallback(
    (name: string): string | null => {
      if (!data) return null;
      const target = name.trim().toLowerCase();
      const exact = data.file_paths.find((p) => p.toLowerCase() === target);
      if (exact) return exact;
      const byBasename = data.file_paths.find(
        (p) => p.split("/").pop()?.toLowerCase() === target
      );
      return byBasename || null;
    },
    [data]
  );

  const analyzeRepo = useCallback(async () => {
    const repo_url = input.trim();
    if (!repo_url) {
      setError("Enter a repo first.");
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const resp = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url }),
      });

      const json = await resp.json();

      if (!resp.ok) {
        const err = json as ApiError;
        throw new Error(err.detail || "Request failed.");
      }

      setData(json as AnalyzeResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") analyzeRepo();
  };

  const a = data?.analysis;

  return (
    <>
      <nav className="topnav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
              0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
              -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07
              -1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82
              .64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
              .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2
              0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
          </svg>
          Repo Explainer
        </Link>
        <Link href="/" className="tagline" style={{ textDecoration: "none" }}>
          ← Back to hub
        </Link>
      </nav>

      <div className="page-shell">
        <Link href="/" className="back-pill">
          ← Back to hub
        </Link>
        <section className="hero">
          <div className="hero-eyebrow">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16Zm3.78-9.72-4.25 4.25a.75.75 0 0 1-1.06 0L4.72 8.78a.75.75 0 0 1 1.06-1.06L7 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06Z"/>
            </svg>
            No paid API required
          </div>
          <h1>
            Turn any repo into <span className="accent">instant architecture docs</span>
          </h1>
          <p className="subhead">
            Paste a public GitHub repository. We read the file tree, README, and
            manifest files, then draft a structural explanation and a system
            diagram — powered by a free Groq API key.
          </p>

          <div className="search-card">
            <span className="prefix">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>
              </svg>
              github.com/
            </span>
            <input
              className="repo-input"
              type="text"
              placeholder="owner/repo  e.g. fastapi/fastapi"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="btn btn-primary" onClick={analyzeRepo} disabled={loading}>
              {loading ? "Analyzing…" : "Analyze"}
            </button>
          </div>
          <p className="hint">
            Or paste a full URL. Requires the FastAPI backend running — see{" "}
            <code>README.md</code>.
          </p>

          {(loading || error) && (
            <div className={`status${error ? " error" : ""}`}>
              <span className="spinner" />
              {error || "Reading file tree, README, and manifest files…"}
            </div>
          )}
        </section>

        {data && (
          <div className="repo-card">
            <div className="repo-title">
              <span className="owner">{data.owner}</span>
              <span className="sep">/</span>
              <a
                className="name"
                href={`https://github.com/${data.owner}/${data.repo}`}
                target="_blank"
                rel="noreferrer"
              >
                {data.repo}
              </a>
              <span className="visibility-badge">Public</span>
            </div>

            {data.description && <p className="repo-desc">{data.description}</p>}

            <div className="repo-meta">
              <span className="item">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
                </svg>
                <span className="star-count">{data.stars}</span> stars
              </span>
              <span className="item">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25ZM1.75 1.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25Z"/>
                </svg>
                {data.file_count} files scanned
              </span>
            </div>

            {data.language_breakdown && data.language_breakdown.length > 0 && (
              <>
                <div className="lang-bar">
                  {data.language_breakdown.map((l) => (
                    <span
                      key={l.name}
                      className="seg"
                      style={{
                        width: `${l.percent}%`,
                        background: languageColor(l.name),
                      }}
                      title={`${l.name} ${l.percent}%`}
                    />
                  ))}
                </div>
                <div className="lang-legend">
                  {data.language_breakdown.map((l) => (
                    <span className="entry" key={l.name}>
                      <span className="dot" style={{ background: languageColor(l.name) }} />
                      {l.name} <span className="pct">{l.percent}%</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {a && (
          <>
            <div className="topics">
              {a.tech_stack?.map((t) => (
                <span className="topic-pill" key={t}>
                  {t}
                </span>
              ))}
              {a.architecture_style && (
                <span className="topic-pill style">{a.architecture_style}</span>
              )}
            </div>

            <div className="section-label">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25ZM4 4h8v1.5H4Zm0 3h8v1.5H4Zm0 3h5v1.5H4Z"/>
              </svg>
              README
            </div>
            <div className="file-panel">
              <div className="file-panel-header">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Z"/>
                </svg>
                <span className="filename">README.md</span>
              </div>
              <div className="file-panel-body">
                <div className="summary-text">{a.summary}</div>
              </div>
            </div>

            <div className="section-label">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.75 4.75a.75.75 0 0 0-1.5 0v3.5c0 .199.079.39.22.53l2.5 2.5a.75.75 0 1 0 1.06-1.06L8.75 7.94Z"/>
              </svg>
              Architecture Diagram
            </div>
            <div className="file-panel">
              <div className="file-panel-header">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Z"/>
                </svg>
                <span className="filename">architecture.mmd</span>
              </div>
              <div className="file-panel-body diagram">
                <MermaidDiagram
                  chart={a.mermaid_diagram}
                  architectureExplanation={a.architecture_explanation}
                  keyComponents={a.key_components}
                />
              </div>
            </div>

            <div className="section-label">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1ZM1.5 2.75v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25Z"/>
              </svg>
              Key Components
            </div>
            <div className="file-list">
              {a.key_components?.map((c) => {
                const filePath = findFilePath(c.name);
                return (
                  <div
                    className={`file-row${filePath ? " clickable" : ""}`}
                    key={c.name}
                    onClick={() => filePath && setViewerPath(filePath)}
                    role={filePath ? "button" : undefined}
                    tabIndex={filePath ? 0 : undefined}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M1.75 1.5A1.75 1.75 0 0 0 0 3.25v9.5A1.75 1.75 0 0 0 1.75 14.5h12.5A1.75 1.75 0 0 0 16 12.75v-8A1.75 1.75 0 0 0 14.25 3H7.5L6 1.5Z"/>
                    </svg>
                    <div style={{ flex: 1 }}>
                      <div className="name">{c.name}</div>
                      <div className="purpose">{c.purpose}</div>
                    </div>
                    {filePath && <span className="view-code-hint">View code →</span>}
                  </div>
                );
              })}
            </div>

            <div className="section-label">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.72 3.22a.75.75 0 0 1 1.06 1.06L2.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L.47 8.53a.75.75 0 0 1 0-1.06Zm6.56 0a.75.75 0 1 0-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06l4.25-4.25a.75.75 0 0 0 0-1.06Z"/>
              </svg>
              Entry Points
            </div>
            <div className="entry-points">
              {a.entry_points?.map((e) => {
                const filePath = findFilePath(e);
                return (
                  <code
                    key={e}
                    className={filePath ? "clickable" : undefined}
                    onClick={() => filePath && setViewerPath(filePath)}
                  >
                    {e}
                  </code>
                );
              })}
            </div>

            <div className="section-label">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A.25.25 0 0 1 5 15.396V13H1.75A1.75 1.75 0 0 1 0 11.25Z"/>
              </svg>
              How It Fits Together
            </div>
            <div className="explanation-text">{a.architecture_explanation}</div>
          </>
        )}

        <footer>
          <span>GitHub Repository Explainer</span>
          <span>
            {data ? (
              <strong>{data.owner}/{data.repo}</strong>
            ) : (
              <>Powered by <strong>Groq</strong> + GitHub API</>
            )}
          </span>
        </footer>
      </div>

      {viewerPath && data && (
        <CodeViewerModal
          owner={data.owner}
          repo={data.repo}
          path={viewerPath}
          defaultBranch={data.default_branch}
          onClose={() => setViewerPath(null)}
        />
      )}
    </>
  );
}
"use client";

import Link from "next/link";
import { useState, useCallback, useEffect } from "react";
import type {
  AnalyzeIssueResponse,
  CreatePrResponse,
  ApiError,
} from "../types";

export default function IssueSolver() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeIssueResponse | null>(null);

  const [branchName, setBranchName] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [creatingPr, setCreatingPr] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [prResult, setPrResult] = useState<CreatePrResponse | null>(null);

  useEffect(() => {
    if (data) {
      setBranchName(`fix/issue-${data.issue.number}`);
      setPrTitle(data.result.pr_title || `Fix #${data.issue.number}`);
      setPrBody(data.result.pr_body || "");
      setPrResult(null);
      setPrError(null);
    }
  }, [data]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") analyzeIssue();
  };

  const analyzeIssue = useCallback(async () => {
    const issue_url = input.trim();
    if (!issue_url) {
      setError("Paste an issue URL first.");
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const resp = await fetch("/api/analyze-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue_url }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        const err = json as ApiError;
        throw new Error(err.detail || "Request failed.");
      }
      setData(json as AnalyzeIssueResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [input]);

  const openPullRequest = useCallback(async () => {
    if (!data) return;
    setCreatingPr(true);
    setPrError(null);
    setPrResult(null);

    try {
      const resp = await fetch("/api/create-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: data.owner,
          repo: data.repo,
          base_branch: data.default_branch,
          branch_name: branchName,
          pr_title: prTitle,
          pr_body: prBody,
          file_changes: data.result.file_changes,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        const err = json as ApiError;
        throw new Error(err.detail || "Failed to create PR.");
      }
      setPrResult(json as CreatePrResponse);
    } catch (e) {
      setPrError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setCreatingPr(false);
    }
  }, [data, branchName, prTitle, prBody]);

  const r = data?.result;

  return (
    <>
      <nav className="topnav">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.93 4.412a.75.75 0 0 1 1.061 1.06L8.28 7.19a1.75 1.75 0 0 1-.176 2.634l-.114.08a.75.75 0 0 1-.834-1.247l.114-.08a.25.25 0 0 0 .025-.376L5.53 6.416a.75.75 0 1 1 1.06-1.06l.94.94Z"/>
          </svg>
          Issue Solver
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
            Paste an issue, get a <span className="accent">plan, code, and a PR</span>
          </h1>
          <p className="subhead">
            We read the issue and the repo, draft an implementation plan and
            file changes with Groq, then — if you approve — open a real
            branch and pull request via the GitHub API.
          </p>

          <div className="search-card">
            <span className="prefix">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>
              </svg>
              Issue URL
            </span>
            <input
              className="repo-input"
              type="text"
              placeholder="https://github.com/owner/repo/issues/123"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="btn btn-primary" onClick={analyzeIssue} disabled={loading}>
              {loading ? "Analyzing…" : "Solve Issue"}
            </button>
          </div>
          <p className="hint">
            Requires the FastAPI backend running — see <code>README.md</code>.
          </p>

          {(loading || error) && (
            <div className={`status${error ? " error" : ""}`}>
              <span className="spinner" />
              {error || "Reading the issue and repository context…"}
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
                href={data.issue.html_url}
                target="_blank"
                rel="noreferrer"
              >
                {data.repo} #{data.issue.number}
              </a>
            </div>
            <p className="repo-desc" style={{ fontWeight: 600, color: "var(--fg-default)" }}>
              {data.issue.title}
            </p>
            {data.issue.labels.length > 0 && (
              <div className="topics" style={{ marginTop: 10 }}>
                {data.issue.labels.map((l) => (
                  <span className="topic-pill" key={l}>
                    {l}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {r && (
          <>
            <div className="callout">
              This will create a real branch and pull request when you click
              "Open Pull Request" below. Use a repo you own or have write
              access to, and make sure your <code>GITHUB_TOKEN</code> has{" "}
              <code>repo</code> scope.
            </div>

            <div className="section-label">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A.25.25 0 0 1 5 15.396V13H1.75A1.75 1.75 0 0 1 0 11.25Z"/>
              </svg>
              Summary
            </div>
            <div className="file-panel">
              <div className="file-panel-body">
                <div className="summary-text">{r.summary}</div>
              </div>
            </div>

            <div className="section-label">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1Z"/>
              </svg>
              Implementation Plan
            </div>
            <ol className="plan-list">
              {r.plan?.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>

            <div className="section-label">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Z"/>
              </svg>
              File Changes
            </div>
            {r.file_changes?.length === 0 && (
              <p style={{ color: "var(--fg-muted)", fontSize: 13.5 }}>
                The model wasn't confident enough to propose file changes for
                this issue — try a more specific issue, or use the plan above
                as a starting point yourself.
              </p>
            )}
            {r.file_changes?.map((fc) => (
              <div className="file-panel" key={fc.path} style={{ marginBottom: 16 }}>
                <div className="file-panel-header">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Z"/>
                  </svg>
                  <span className="filename">{fc.path}</span>
                  <span className={`diff-badge ${fc.action}`}>{fc.action}</span>
                </div>
                <div className="file-panel-body">
                  <pre className="code-block">{fc.content}</pre>
                </div>
              </div>
            ))}

            {r.file_changes?.length > 0 && (
              <>
                <div className="section-label">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.72 3.22a.75.75 0 0 1 1.06 1.06L2.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L.47 8.53a.75.75 0 0 1 0-1.06Zm6.56 0a.75.75 0 1 0-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06l4.25-4.25a.75.75 0 0 0 0-1.06Z"/>
                  </svg>
                  Open Pull Request
                </div>
                <div className="pr-form">
                  <label>
                    Base branch
                    <input value={data!.default_branch} disabled />
                  </label>
                  <label>
                    New branch name
                    <input value={branchName} onChange={(e) => setBranchName(e.target.value)} />
                  </label>
                  <label>
                    PR title
                    <input value={prTitle} onChange={(e) => setPrTitle(e.target.value)} />
                  </label>
                  <label>
                    PR description
                    <textarea rows={3} value={prBody} onChange={(e) => setPrBody(e.target.value)} />
                  </label>

                  <button
                    className="btn btn-primary"
                    style={{ width: "fit-content" }}
                    onClick={openPullRequest}
                    disabled={creatingPr}
                  >
                    {creatingPr ? "Opening PR…" : "Open Pull Request"}
                  </button>

                  {prError && <div className="status error">{prError}</div>}
                  {prResult && (
                    <div className="pr-success">
                      ✓ Pull request opened on branch{" "}
                      <code>{prResult.branch_name}</code>.{" "}
                      <a href={prResult.pr_url} target="_blank" rel="noreferrer">
                        View it on GitHub ↗
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        <footer>
          <span>GitHub Issue Solver</span>
          <span>
            {data ? (
              <strong>
                {data.owner}/{data.repo} #{data.issue.number}
              </strong>
            ) : (
              <>Powered by <strong>Groq</strong> + GitHub API</>
            )}
          </span>
        </footer>
      </div>
    </>
  );
}
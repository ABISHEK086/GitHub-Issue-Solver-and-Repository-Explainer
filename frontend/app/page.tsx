"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";

function useTypewriter(text: string, ready: boolean, speedMs = 28) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!ready || !text) return;
    setShown("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speedMs);
    return () => clearInterval(id);
  }, [text, ready, speedMs]);

  return { shown, done };
}

export default function Hub() {
  const { data: session, status } = useSession();

  const displayName =
    session?.user?.name?.split(" ")[0] ||
    session?.user?.email?.split("@")[0] ||
    "there";
  const greeting = `Hi! ${displayName} — how can I help you today?`;
  const sessionReady = status === "authenticated";

  const { shown, done } = useTypewriter(greeting, sessionReady);

  return (
    <>
      <nav className="topnav">
        <span className="brand">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
              0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
              -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07
              -1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82
              .64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
              .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2
              0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
          </svg>
          AI Dev Tools
        </span>
        <div className="nav-auth">
          {status === "loading" ? null : session?.user ? (
            <>
              <span className="user-chip">
                <span className="user-avatar">
                  {session.user.image ? (
                    <img src={session.user.image} alt={session.user.name || "User"} />
                  ) : (
                    (session.user.name || session.user.email || "?")[0]
                  )}
                </span>
                {session.user.name || session.user.email}
              </span>
              <button onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button>
            </>
          ) : (
            <Link href="/login">Sign in</Link>
          )}
        </div>
      </nav>

      <div className="hub-shell">
        <div className="greet-row">
          <span className="avatar">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 3.5A1.75 1.75 0 1 1 8 7a1.75 1.75 0 0 1 0-3.5ZM4.35 12.2a4.15 4.15 0 0 1 7.3 0 6.47 6.47 0 0 1-7.3 0Z"/>
            </svg>
          </span>
          <div className="greet-bubble">
            {sessionReady ? shown : ""}
            {sessionReady && <span className={`caret${done ? " blink" : ""}`}>▍</span>}
          </div>
        </div>

        <p className="hub-sub">Pick a tool to get started — both run on free API keys.</p>

        <div className="option-grid">
          <Link href="/explainer" className="option-card" style={{ animationDelay: "0.15s" }}>
            <div className="option-icon">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.75 4.75a.75.75 0 0 0-1.5 0v3.5c0 .199.079.39.22.53l2.5 2.5a.75.75 0 1 0 1.06-1.06L8.75 7.94Z"/>
              </svg>
            </div>
            <div className="option-body">
              <div className="option-title">
                1. GitHub Repo Explainer
                <span className="option-arrow">→</span>
              </div>
              <p className="option-desc">
                Paste any public repo and get an instant summary, tech stack,
                key components, and an architecture diagram.
              </p>
              <div className="option-tags">
                <span>Groq</span>
                <span>GitHub API</span>
                <span>Mermaid.js</span>
              </div>
            </div>
          </Link>

          <Link href="/issue-solver" className="option-card" style={{ animationDelay: "0.3s" }}>
            <div className="option-icon">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.93 4.412a.75.75 0 0 1 1.061 1.06L8.28 7.19a1.75 1.75 0 0 1-.176 2.634l-.114.08a.75.75 0 0 1-.834-1.247l.114-.08a.25.25 0 0 0 .025-.376L5.53 6.416a.75.75 0 1 1 1.06-1.06l.94.94Z"/>
              </svg>
            </div>
            <div className="option-body">
              <div className="option-title">
                2. GitHub Issue Solver
                <span className="option-arrow">→</span>
              </div>
              <p className="option-desc">
                Paste an issue URL. Get an implementation plan, generated code
                changes, and a real pull request opened on your repo.
              </p>
              <div className="option-tags">
                <span>Groq</span>
                <span>GitHub API</span>
                <span>Agentic PR flow</span>
              </div>
            </div>
          </Link>
        </div>

        <footer style={{ borderTop: "none", marginTop: 40 }}>
          <span>AI Dev Tools</span>
          <span>Two free-tier portfolio projects, one shared backend</span>
        </footer>
      </div>
    </>
  );
}
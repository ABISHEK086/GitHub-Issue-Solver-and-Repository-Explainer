"use client";

import { useEffect, useState, useCallback } from "react";
import type { FileContentResponse, ApiError } from "./types";

interface Props {
  owner: string;
  repo: string;
  path: string;
  defaultBranch: string;
  onClose: () => void;
}

export default function CodeViewerModal({ owner, repo, path, defaultBranch, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [size, setSize] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch("/api/file-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner, repo, path, ref: defaultBranch }),
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error((json as ApiError).detail || "Failed to load file.");
        if (cancelled) return;
        const fc = json as FileContentResponse;
        setContent(fc.content);
        setSize(fc.size);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, path, defaultBranch]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [content]);

  const lineCount = content ? content.split("\n").length : 0;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1).join("\n");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Z"/>
          </svg>
          <span className="modal-filename">{path}</span>
          {!loading && !error && (
            <span className="modal-size">{(size / 1024).toFixed(1)} KB</span>
          )}
          <div className="modal-actions">
            {!loading && !error && (
              <button className="modal-btn" onClick={handleCopy}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            )}
            <button className="modal-btn modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {loading && (
          <div className="status" style={{ padding: 20 }}>
            <span className="spinner" />
            Loading file…
          </div>
        )}
        {error && <div className="status error" style={{ padding: 20 }}>{error}</div>}

        {!loading && !error && (
          <div className="modal-code-wrap">
            <div className="modal-gutter">{lineNumbers}</div>
            <pre className="modal-code">{content}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
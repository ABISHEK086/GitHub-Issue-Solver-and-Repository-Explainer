"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { KeyComponent } from "./types";

interface Props {
  chart: string;
  architectureExplanation?: string;
  keyComponents?: KeyComponent[];
}

export default function MermaidDiagram({
  chart,
  architectureExplanation,
  keyComponents,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentChart, setCurrentChart] = useState(chart);
  const [errored, setErrored] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => setCurrentChart(chart), [chart]);

  const renderChart = useCallback(async (chartText: string) => {
    if (!chartText || !containerRef.current) return;
    setErrored(false);
    const mermaid = (await import("mermaid")).default;

    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      flowchart: {
        htmlLabels: false,
        curve: "basis",
        padding: 18,
        nodeSpacing: 44,
        rankSpacing: 56,
        useMaxWidth: true,
      },
      themeVariables: {
        background: "#0d1117",
        primaryColor: "#161b22",
        primaryTextColor: "#e6edf3",
        primaryBorderColor: "#58a6ff",
        lineColor: "#58a6ff",
        secondaryColor: "#161b22",
        tertiaryColor: "#0d1117",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "13px",
        edgeLabelBackground: "#0d1117",
      },
    });

    try {
      const id = `mmd-${Date.now()}`;
      const { svg } = await mermaid.render(id, chartText);
      if (containerRef.current) containerRef.current.innerHTML = svg;
    } catch (e) {
      setErrored(true);
    }
  }, []);

  useEffect(() => {
    renderChart(currentChart);
  }, [currentChart, renderChart]);

  const handleRegenerate = async () => {
    if (!architectureExplanation) return;
    setRegenerating(true);
    try {
      const resp = await fetch("/api/regenerate-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          architecture_explanation: architectureExplanation,
          key_components: keyComponents || [],
        }),
      });
      const json = await resp.json();
      if (resp.ok && json.mermaid_diagram) {
        setCurrentChart(json.mermaid_diagram);
      } else {
        setErrored(true);
      }
    } catch {
      setErrored(true);
    } finally {
      setRegenerating(false);
    }
  };

  if (errored) {
    return (
      <div>
        <div style={{ color: "var(--fg-muted)", fontSize: 13, marginBottom: 12 }}>
          Diagram could not be rendered — the model returned Mermaid syntax
          that didn&apos;t parse.
        </div>
        {architectureExplanation && (
          <button
            className="btn btn-primary"
            style={{ marginBottom: 14, height: 32 }}
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating ? "Regenerating…" : "Regenerate diagram"}
          </button>
        )}
        <pre
          style={{
            fontSize: 11.5,
            color: "var(--fg-muted)",
            whiteSpace: "pre-wrap",
            overflowX: "auto",
            marginTop: 8,
            background: "var(--canvas-inset)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: 12,
          }}
        >
          {currentChart}
        </pre>
      </div>
    );
  }

  return <div ref={containerRef} />;
}
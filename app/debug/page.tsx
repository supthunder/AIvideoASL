"use client";

import { useEffect, useState } from "react";
import { readMetrics, clearMetrics, percentile, type UtteranceMetric } from "@/lib/metrics";

export default function DebugPage() {
  const [items, setItems] = useState<UtteranceMetric[]>([]);

  useEffect(() => {
    setItems(readMetrics());
    const id = setInterval(() => setItems(readMetrics()), 1000);
    return () => clearInterval(id);
  }, []);

  const recent = items.slice(-20).reverse();
  const totals = items.filter((u) => typeof u.totalLatencyMs === "number").map((u) => u.totalLatencyMs!);
  const glosses = items.filter((u) => typeof u.glossLatencyMs === "number").map((u) => u.glossLatencyMs!);
  const fmt = (n: number | null) => (n === null ? "—" : `${Math.round(n)} ms`);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.6rem" }}>/debug — latency log</h1>
        <a href="/" style={{ color: "var(--accent)" }}>← back</a>
      </header>

      <section style={panelStyle}>
        <h2 style={h2Style}>End-to-end (STT final → first clip play)</h2>
        <div style={{ display: "flex", gap: "1.5rem", fontFamily: "ui-monospace, monospace" }}>
          <div>p50: <strong>{fmt(percentile(totals, 50))}</strong></div>
          <div>p95: <strong>{fmt(percentile(totals, 95))}</strong></div>
          <div>n: {totals.length}</div>
          <div style={{ color: "var(--muted)" }}>target: p50 ≤ 1000 ms · p95 ≤ 2000 ms</div>
        </div>

        <h2 style={{ ...h2Style, marginTop: "1rem" }}>Gloss API (STT final → gloss done)</h2>
        <div style={{ display: "flex", gap: "1.5rem", fontFamily: "ui-monospace, monospace" }}>
          <div>p50: <strong>{fmt(percentile(glosses, 50))}</strong></div>
          <div>p95: <strong>{fmt(percentile(glosses, 95))}</strong></div>
          <div>n: {glosses.length}</div>
        </div>
      </section>

      <section style={{ ...panelStyle, marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={h2Style}>Last {recent.length} utterances</h2>
          <button className="secondary" onClick={() => { clearMetrics(); setItems([]); }}>Clear</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "ui-monospace, monospace", fontSize: "0.85rem", marginTop: "0.5rem" }}>
          <thead>
            <tr style={{ color: "var(--muted)", textAlign: "left" }}>
              <th style={th}>time</th>
              <th style={th}>mode</th>
              <th style={th}>text</th>
              <th style={th}>gloss n</th>
              <th style={thRight}>gloss ms</th>
              <th style={thRight}>total ms</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, color: "var(--muted)" }}>no utterances yet — go say something on /</td></tr>
            )}
            {recent.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={td}>{new Date(u.sttFinalAt).toLocaleTimeString()}</td>
                <td style={td}>{u.sttMode}</td>
                <td style={{ ...td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.text}>{u.text}</td>
                <td style={td}>{u.glossWords}</td>
                <td style={tdRight}>{u.glossLatencyMs ?? "—"}</td>
                <td style={{ ...tdRight, color: u.totalLatencyMs && u.totalLatencyMs <= 1000 ? "var(--accent)" : u.totalLatencyMs && u.totalLatencyMs <= 2000 ? "var(--fg)" : "var(--danger)" }}>{u.totalLatencyMs ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

const panelStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "1rem 1.1rem",
};
const h2Style: React.CSSProperties = { fontSize: "0.85rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 0.5rem 0" };
const th: React.CSSProperties = { padding: "0.4rem 0.5rem", fontWeight: 600 };
const thRight: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "0.35rem 0.5rem", verticalAlign: "top" };
const tdRight: React.CSSProperties = { ...td, textAlign: "right" };

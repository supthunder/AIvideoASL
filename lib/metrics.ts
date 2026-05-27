// Per-utterance latency log, persisted to localStorage.
// Used by /debug to show p50/p95 of the end-to-end pipeline.

const KEY = "lsl:metrics:v1";
const MAX = 100;

export type UtteranceMetric = {
  id: string;
  text: string;
  glossWords: number;
  sttFinalAt: number;     // ms since epoch when transcript finalised
  glossDoneAt?: number;   // ms when /api/gloss returned
  firstClipPlayAt?: number; // ms when first <video> 'playing' fired
  glossLatencyMs?: number;
  totalLatencyMs?: number;
  sttMode: "web-speech" | "gemini-live";
};

function read(): UtteranceMetric[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(arr: UtteranceMetric[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX)));
  } catch {
    // Storage full — drop silently.
  }
}

export function recordUtterance(initial: UtteranceMetric): void {
  const all = read();
  all.push(initial);
  write(all);
}

export function patchUtterance(id: string, patch: Partial<UtteranceMetric>): void {
  const all = read();
  const idx = all.findIndex((u) => u.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...patch };
  if (all[idx].glossDoneAt && all[idx].sttFinalAt) {
    all[idx].glossLatencyMs = all[idx].glossDoneAt - all[idx].sttFinalAt;
  }
  if (all[idx].firstClipPlayAt && all[idx].sttFinalAt) {
    all[idx].totalLatencyMs = all[idx].firstClipPlayAt - all[idx].sttFinalAt;
  }
  write(all);
}

export function readMetrics(): UtteranceMetric[] {
  return read();
}

export function clearMetrics(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

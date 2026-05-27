"use client";

import { useEffect, useRef, useState } from "react";
import { planClips, type ClipStep } from "@/lib/clips";
import { GeminiLiveClient } from "@/lib/gemini-live";
import { recordUtterance, patchUtterance } from "@/lib/metrics";

type SttMode = "web-speech" | "gemini-live";
type SourceMode = "mic" | "url";

type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognizer(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export default function Page() {
  const [sourceMode, setSourceMode] = useState<SourceMode>("mic");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sttMode, setSttMode] = useState<SttMode>("web-speech");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [partial, setPartial] = useState("");
  const [gloss, setGloss] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string>("");

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const liveRef = useRef<GeminiLiveClient | null>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const queueRef = useRef<ClipStep[]>([]);
  const playingRef = useRef(false);
  const pendingMetricRef = useRef<string | null>(null);
  const signerVideoRef = useRef<HTMLVideoElement | null>(null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);

  // URL mode forces Gemini Live (Web Speech API can't accept a stream).
  useEffect(() => {
    if (sourceMode === "url" && sttMode === "web-speech") setSttMode("gemini-live");
  }, [sourceMode, sttMode]);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      void liveRef.current?.stop();
      hlsRef.current?.destroy();
    };
  }, []);

  function ingestFinal(chunk: string) {
    if (!chunk.trim()) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    recordUtterance({
      id,
      text: chunk,
      glossWords: 0,
      sttFinalAt: Date.now(),
      sttMode,
    });
    pendingMetricRef.current = id;
    setTranscript((prev) => (prev ? `${prev} ${chunk}` : chunk));
    setPartial("");
    void translate(chunk, id);
  }

  async function translate(text: string, metricId: string) {
    const res = await fetch("/api/gloss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) { setError(`gloss API error: ${res.status}`); return; }
    const data = (await res.json()) as { gloss?: string[] };
    const glossArr = data.gloss ?? [];
    patchUtterance(metricId, { glossDoneAt: Date.now(), glossWords: glossArr.length });
    setGloss((prev) => [...prev, ...glossArr]);
    const steps = planClips(glossArr);
    queueRef.current.push(...steps);
    pump(metricId);
  }

  function pump(metricIdHint?: string) {
    if (playingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) { setNowPlaying(""); return; }
    playingRef.current = true;
    const onFirstPlay = () => {
      const id = metricIdHint ?? pendingMetricRef.current;
      if (id) {
        patchUtterance(id, { firstClipPlayAt: Date.now() });
        pendingMetricRef.current = null;
      }
    };
    if (next.kind === "sign") playClip(next.src, next.gloss, onFirstPlay);
    else playFingerspell(next.word, next.letters, 0, onFirstPlay);
  }

  function playClip(src: string, label: string, onPlay?: () => void) {
    const v = signerVideoRef.current;
    if (!v) return;
    setNowPlaying(label);
    v.src = src;
    let played = false;
    v.onplaying = () => { if (!played) { played = true; onPlay?.(); } };
    v.onended = () => { playingRef.current = false; pump(); };
    v.onerror = () => setTimeout(() => { playingRef.current = false; pump(); }, 600);
    v.play().catch(() => { playingRef.current = false; pump(); });
  }

  function playFingerspell(word: string, letters: { letter: string; src: string }[], i: number, onFirstPlay?: () => void) {
    if (i >= letters.length) { playingRef.current = false; pump(); return; }
    const v = signerVideoRef.current;
    if (!v) return;
    setNowPlaying(`${word} (${letters[i].letter})`);
    v.src = letters[i].src;
    let played = false;
    v.onplaying = () => { if (i === 0 && !played) { played = true; onFirstPlay?.(); } };
    v.onended = () => playFingerspell(word, letters, i + 1);
    v.onerror = () => setTimeout(() => playFingerspell(word, letters, i + 1), 250);
    v.play().catch(() => playFingerspell(word, letters, i + 1));
  }

  async function loadSourceVideo(): Promise<MediaStream> {
    const v = sourceVideoRef.current;
    if (!v) throw new Error("source video element not mounted");
    const isHls = sourceUrl.endsWith(".m3u8") || sourceUrl.includes(".m3u8?");
    if (isHls && !v.canPlayType("application/vnd.apple.mpegurl")) {
      const Hls = (await import("hls.js")).default;
      if (!Hls.isSupported()) throw new Error("HLS not supported in this browser");
      const hls = new Hls();
      hls.loadSource(sourceUrl);
      hls.attachMedia(v);
      hlsRef.current = hls;
    } else {
      v.src = sourceUrl;
    }
    v.crossOrigin = "anonymous";
    await v.play();
    type WithCapture = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
    const capture = (v as WithCapture).captureStream?.bind(v) ?? (v as WithCapture).mozCaptureStream?.bind(v);
    if (!capture) throw new Error("captureStream() not supported in this browser");
    const stream = capture();
    if (stream.getAudioTracks().length === 0) throw new Error("source has no audio track");
    return stream;
  }

  async function startWebSpeech() {
    const rec = getRecognizer();
    if (!rec) throw new Error("Web Speech API not available. Try Chrome, or switch STT mode to Gemini Live.");
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) ingestFinal(result[0].transcript.trim());
      }
    };
    rec.onerror = (event) => setError(`STT error: ${event.error}`);
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
  }

  async function startGeminiLive() {
    const client = new GeminiLiveClient({
      onPartial: (text) => setPartial(text),
      onFinal: (text) => ingestFinal(text),
      onError: (msg) => setError(msg),
      onClose: () => setListening(false),
    });
    if (sourceMode === "url") {
      const stream = await loadSourceVideo();
      await client.startWithStream(stream);
    } else {
      await client.start();
    }
    liveRef.current = client;
  }

  async function start() {
    setError(null);
    setTranscript("");
    setPartial("");
    setGloss([]);
    queueRef.current = [];
    try {
      if (sttMode === "web-speech") await startWebSpeech();
      else await startGeminiLive();
      setListening(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }

  function stop() {
    recRef.current?.stop();
    void liveRef.current?.stop();
    hlsRef.current?.destroy();
    liveRef.current = null;
    hlsRef.current = null;
    if (sourceVideoRef.current) sourceVideoRef.current.pause();
    setListening(false);
  }

  const canStart = sourceMode === "mic" || sourceUrl.trim().length > 0;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.8rem" }}>livesignlanguage</h1>
        <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          STT → ASL gloss → signer clips · <a href="/debug" style={{ color: "var(--accent)" }}>/debug</a>
        </span>
      </header>

      <div style={controlsStyle}>
        {listening ? (
          <button className="secondary" onClick={stop}>Stop</button>
        ) : (
          <button onClick={start} disabled={!canStart}>Start</button>
        )}
        <span style={{ color: listening ? "var(--accent)" : "var(--muted)" }}>
          {listening ? "● live" : "idle"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label style={labelStyle}>
            Source:
            <select value={sourceMode} onChange={(e) => setSourceMode(e.target.value as SourceMode)} disabled={listening} style={selectStyle}>
              <option value="mic">Microphone</option>
              <option value="url">Livestream URL</option>
            </select>
          </label>
          <label style={labelStyle}>
            STT:
            <select value={sttMode} onChange={(e) => setSttMode(e.target.value as SttMode)} disabled={listening || sourceMode === "url"} style={selectStyle}>
              <option value="web-speech">Web Speech (Chrome, free)</option>
              <option value="gemini-live">Gemini Live ($0.06/hr)</option>
            </select>
          </label>
        </div>
      </div>

      {sourceMode === "url" && (
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="url"
            placeholder="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            disabled={listening}
            style={{ width: "100%", background: "var(--panel)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.6rem 0.8rem", fontFamily: "ui-monospace, monospace", fontSize: "0.9rem" }}
          />
          <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "0.4rem 0 0" }}>
            HLS (.m3u8) or direct MP4 URL with CORS-allowed audio. URL mode requires Gemini Live STT.
          </p>
        </div>
      )}

      {error && (
        <div style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: sourceMode === "url" ? "1fr 1fr 1fr" : "1fr 1fr", gap: "1.25rem" }}>
        {sourceMode === "url" && (
          <section style={panelStyle}>
            <h2 style={h2Style}>Source</h2>
            <div style={{ aspectRatio: "16/9", background: "#000", borderRadius: 8, overflow: "hidden" }}>
              <video ref={sourceVideoRef} playsInline controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </section>
        )}

        <section style={panelStyle}>
          <h2 style={h2Style}>Signer</h2>
          <div style={{ aspectRatio: "16/9", background: "#000", borderRadius: 8, overflow: "hidden", position: "relative" }}>
            <video ref={signerVideoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {nowPlaying && (
              <div style={{ position: "absolute", left: 12, bottom: 12, padding: "4px 10px", background: "rgba(0,0,0,0.6)", borderRadius: 6, fontSize: "0.85rem" }}>
                {nowPlaying}
              </div>
            )}
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={h2Style}>Transcript</h2>
          <div style={{ minHeight: 80, color: "var(--fg)", lineHeight: 1.5 }}>
            {transcript || <span style={{ color: "var(--muted)" }}>(say something…)</span>}
            {partial && <span style={{ color: "var(--muted)" }}> {partial}</span>}
          </div>

          <h2 style={{ ...h2Style, marginTop: "1.25rem" }}>ASL gloss</h2>
          <div style={{ fontFamily: "ui-monospace, monospace", color: "var(--accent)", letterSpacing: "0.04em" }}>
            {gloss.length ? gloss.join(" ") : <span style={{ color: "var(--muted)" }}>—</span>}
          </div>
        </section>
      </div>
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
const controlsStyle: React.CSSProperties = { display: "flex", gap: "0.75rem", marginBottom: "1.5rem", alignItems: "center", flexWrap: "wrap" };
const labelStyle: React.CSSProperties = { display: "flex", gap: "0.4rem", alignItems: "center", color: "var(--muted)", fontSize: "0.85rem" };
const selectStyle: React.CSSProperties = { background: "var(--panel)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.4rem 0.6rem" };

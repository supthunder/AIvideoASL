"use client";

import { useEffect, useRef, useState } from "react";
import { planClips, type ClipStep } from "@/lib/clips";

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
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [gloss, setGloss] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const queueRef = useRef<ClipStep[]>([]);
  const playingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [nowPlaying, setNowPlaying] = useState<string>("");

  useEffect(() => {
    return () => {
      recRef.current?.abort();
    };
  }, []);

  async function translate(text: string) {
    const res = await fetch("/api/gloss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      setError(`gloss API error: ${res.status}`);
      return;
    }
    const data = (await res.json()) as { gloss?: string[] };
    const glossArr = data.gloss ?? [];
    setGloss((prev) => [...prev, ...glossArr]);
    const steps = planClips(glossArr);
    queueRef.current.push(...steps);
    pump();
  }

  function pump() {
    if (playingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      setNowPlaying("");
      return;
    }
    playingRef.current = true;
    if (next.kind === "sign") {
      playClip(next.src, next.gloss);
    } else {
      playFingerspell(next.word, next.letters, 0);
    }
  }

  function playClip(src: string, label: string) {
    const v = videoRef.current;
    if (!v) return;
    setNowPlaying(label);
    v.src = src;
    v.onended = () => {
      playingRef.current = false;
      pump();
    };
    v.onerror = () => {
      // Clip missing — show label as fallback for ~600ms.
      setTimeout(() => {
        playingRef.current = false;
        pump();
      }, 600);
    };
    v.play().catch(() => {
      playingRef.current = false;
      pump();
    });
  }

  function playFingerspell(word: string, letters: { letter: string; src: string }[], i: number) {
    if (i >= letters.length) {
      playingRef.current = false;
      pump();
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    setNowPlaying(`${word} (${letters[i].letter})`);
    v.src = letters[i].src;
    v.onended = () => playFingerspell(word, letters, i + 1);
    v.onerror = () => setTimeout(() => playFingerspell(word, letters, i + 1), 250);
    v.play().catch(() => playFingerspell(word, letters, i + 1));
  }

  function start() {
    setError(null);
    const rec = getRecognizer();
    if (!rec) {
      setError("Web Speech API not available in this browser. Try Chrome.");
      return;
    }
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (event) => {
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const chunk = result[0].transcript.trim();
          if (!chunk) continue;
          setTranscript((prev) => (prev ? `${prev} ${chunk}` : chunk));
          void translate(chunk);
        }
      }
    };
    rec.onerror = (event) => setError(`STT error: ${event.error}`);
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.8rem" }}>livesignlanguage</h1>
        <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          STT → ASL gloss → signer clips
        </span>
      </header>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {listening ? (
          <button className="secondary" onClick={stop}>Stop</button>
        ) : (
          <button onClick={start}>Start listening</button>
        )}
        <span style={{ color: listening ? "var(--accent)" : "var(--muted)", alignSelf: "center" }}>
          {listening ? "● live" : "idle"}
        </span>
      </div>

      {error && (
        <div style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        <section style={panelStyle}>
          <h2 style={h2Style}>Signer</h2>
          <div style={{ aspectRatio: "16/9", background: "#000", borderRadius: 8, overflow: "hidden", position: "relative" }}>
            <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

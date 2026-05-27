#!/usr/bin/env node
// Golden gloss tests. 10 hand-written English → ASL gloss pairs.
// Risk mitigation for GOAL.md §8: catches LLM regressions in gloss quality.
//
// Pass criterion: ≥ 80% of expected tokens appear in the model's output (token recall).
// Run:
//   GEMINI_API_KEY=... node tests/gloss.test.mjs
// Or with the dev server running:
//   node tests/gloss.test.mjs --via-api

import { argv } from "node:process";

const viaApi = argv.includes("--via-api");

const CASES = [
  { english: "Hello, how are you today?",
    expect: ["HELLO", "HOW", "YOU", "TODAY"] },
  { english: "I want to eat pizza tomorrow.",
    expect: ["TOMORROW", "ME", "WANT", "EAT", "PIZZA"] },
  { english: "What is your name?",
    expect: ["YOUR", "NAME", "WHAT"] },
  { english: "I do not understand.",
    expect: ["ME", "UNDERSTAND", "NOT"] },
  { english: "Where is the bathroom?",
    expect: ["BATHROOM", "WHERE"] },
  { english: "Thank you very much.",
    expect: ["THANK-YOU"] },
  { english: "She is my sister.",
    expect: ["SHE", "MY", "SISTER"] },
  { english: "I am learning sign language.",
    expect: ["ME", "LEARN", "SIGN", "LANGUAGE"] },
  { english: "The weather is cold today.",
    expect: ["TODAY", "WEATHER", "COLD"] },
  { english: "Please call me later.",
    expect: ["PLEASE", "CALL", "ME", "LATER"] },
];

async function glossViaApi(text) {
  const res = await fetch("http://localhost:3000/api/gloss", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.gloss ?? [];
}

async function glossDirect(text) {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const SYSTEM = `You translate English to American Sign Language (ASL) gloss. ASL gloss is UPPERCASE words in ASL grammar order, hyphenated compounds (e.g. THANK-YOU), no English function words that ASL drops (a, the, is, are). Output ONLY a JSON object: {"gloss": ["WORD", ...]}.`;
  const r = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: text,
    config: { systemInstruction: SYSTEM, responseMimeType: "application/json", temperature: 0.2 },
  });
  try {
    return JSON.parse(r.text ?? "{}").gloss ?? [];
  } catch {
    return [];
  }
}

const callGloss = viaApi ? glossViaApi : glossDirect;

if (!viaApi && !process.env.GEMINI_API_KEY) {
  console.error("✗ GEMINI_API_KEY not set. Pass --via-api to use the dev server instead.");
  process.exit(2);
}

let pass = 0;
let totalRecall = 0;
const failures = [];

for (const c of CASES) {
  let got;
  try {
    got = await callGloss(c.english);
  } catch (err) {
    failures.push({ english: c.english, err: err.message });
    continue;
  }
  const gotSet = new Set(got.map((g) => g.toUpperCase()));
  const hits = c.expect.filter((e) => gotSet.has(e.toUpperCase()));
  const recall = hits.length / c.expect.length;
  totalRecall += recall;
  const ok = recall >= 0.8;
  if (ok) pass++;
  else failures.push({ english: c.english, expect: c.expect, got });
  console.log(`  ${ok ? "✓" : "✗"}  recall ${(recall * 100).toFixed(0).padStart(3)}%  | "${c.english}"`);
  if (!ok) console.log(`        expected: ${c.expect.join(", ")}\n        got:      ${got.join(", ")}`);
}

const avgRecall = (totalRecall / CASES.length) * 100;
console.log(`\n${pass}/${CASES.length} passed. Average recall: ${avgRecall.toFixed(1)}%`);

if (pass / CASES.length >= 0.8) {
  console.log("✓ Golden gloss tests PASSED (≥ 80% cases at ≥ 80% recall)");
  process.exit(0);
} else {
  console.log("✗ Golden gloss tests FAILED — gloss quality below threshold");
  process.exit(1);
}

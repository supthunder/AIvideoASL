#!/usr/bin/env node
// Offline gloss CLI — exercises /api/gloss without a microphone.
// Reads text from argv or stdin, prints the gloss array and planned clip steps.
//
// Usage:
//   node scripts/test-gloss.mjs "hello how are you"
//   echo "I want pizza tomorrow" | node scripts/test-gloss.mjs
//
// Requires: GEMINI_API_KEY env var, and `npm run dev` running on :3000.

import { argv, stdin } from "node:process";

async function readStdin() {
  if (stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

const cliText = argv.slice(2).join(" ").trim();
const text = cliText || (await readStdin());

if (!text) {
  console.error("Usage: node scripts/test-gloss.mjs \"some English text\"");
  process.exit(1);
}

const url = process.env.LSL_URL ?? "http://localhost:3000/api/gloss";

const t0 = Date.now();
let res;
try {
  res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
} catch (err) {
  console.error(`✗ fetch failed (is \`npm run dev\` running?): ${err.message}`);
  process.exit(1);
}
const ms = Date.now() - t0;

if (!res.ok) {
  console.error(`✗ ${res.status} ${res.statusText}`);
  console.error(await res.text());
  process.exit(1);
}

const data = await res.json();
console.log(`\nEnglish: ${text}`);
console.log(`Gloss:   ${(data.gloss ?? []).join(" ")}`);
console.log(`Latency: ${ms} ms\n`);

// Show what the planner would do.
try {
  const mod = await import("../lib/clips.ts");
  const steps = mod.planClips(data.gloss ?? []);
  for (const step of steps) {
    if (step.kind === "sign") console.log(`  sign:        ${step.gloss.padEnd(14)} -> ${step.src}`);
    else console.log(`  fingerspell: ${step.word.padEnd(14)} -> ${step.letters.map((l) => l.letter).join("-")}`);
  }
} catch {
  // lib/clips.ts not loadable as plain JS — that's fine, server-side path already did the work.
}

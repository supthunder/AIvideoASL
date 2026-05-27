#!/usr/bin/env node
// Reports how many of the top English words are covered by the current clip library.
// Used to verify GOAL.md D8 (≥ 200 of 300 top words covered).

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);

const topWordsRaw = await readFile(join(__dirname, "top-words.json"), "utf8");
const { words } = JSON.parse(topWordsRaw);

// Regenerate the manifest first so we're measuring current state.
await import("./gen-clips-manifest.mjs");

const generated = await readFile(join(ROOT, "lib", "clips.generated.ts"), "utf8");
const knownMatch = generated.match(/KNOWN_GLOSSES[^[]*\[([\s\S]*?)\]/);
const known = new Set(
  (knownMatch?.[1] ?? "")
    .split(/[\n,]/)
    .map((s) => s.replace(/["\s]/g, ""))
    .filter(Boolean),
);

const hits = words.filter((w) => known.has(w.toUpperCase()));
const misses = words.filter((w) => !known.has(w.toUpperCase()));
const pct = ((hits.length / words.length) * 100).toFixed(1);

console.log(`\nClip library coverage: ${hits.length} / ${words.length} top words (${pct}%)`);
console.log(`Library size: ${known.size} total glosses\n`);

if (misses.length > 0 && misses.length <= 40) {
  console.log(`Missing (first 40):\n  ${misses.slice(0, 40).join(", ")}\n`);
} else if (misses.length > 40) {
  console.log(`Missing ${misses.length} words — sample: ${misses.slice(0, 20).join(", ")}, ...\n`);
}

const D8_TARGET = 200;
if (hits.length >= D8_TARGET) {
  console.log(`✓ D8 met (${hits.length} ≥ ${D8_TARGET})`);
  process.exit(0);
} else {
  console.log(`✗ D8 not yet met (${hits.length} < ${D8_TARGET}). Add ${D8_TARGET - hits.length} more clips.`);
  process.exit(1);
}

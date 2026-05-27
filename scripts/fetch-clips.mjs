#!/usr/bin/env node
// Helper to populate public/signs/ with ASL signer clips.
//
// Supports two modes:
//   1. PLACEHOLDER  (default)  — generates short labelled MP4s using ffmpeg drawtext
//                                so the pipeline can be exercised end-to-end without
//                                touching dataset licensing. Output is text-on-black.
//   2. WLASL                   — reads scripts/wlasl-urls.json (you provide) and uses
//                                yt-dlp + ffmpeg to download and trim YouTube clips.
//                                Only run if your license terms allow it.
//
// Usage:
//   node scripts/fetch-clips.mjs              # placeholders for the top vocab
//   node scripts/fetch-clips.mjs --mode wlasl # YouTube download path
//   node scripts/fetch-clips.mjs --letters    # 26 fingerspell letters only
//
// Requires:
//   - ffmpeg on PATH (https://ffmpeg.org/) for both modes
//   - yt-dlp on PATH for --mode wlasl (https://github.com/yt-dlp/yt-dlp)

import { execFile } from "node:child_process";
import { mkdir, readFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(__dirname);
const SIGNS_DIR = join(ROOT, "public", "signs");
const LETTERS_DIR = join(SIGNS_DIR, "letters");

const args = new Set(process.argv.slice(2));
const mode = args.has("--mode") ? process.argv[process.argv.indexOf("--mode") + 1] : "placeholder";
const lettersOnly = args.has("--letters");

async function ensureBin(bin) {
  try {
    await exec(bin, ["-version"]);
  } catch {
    console.error(`✗ ${bin} not found on PATH. Install it and retry.`);
    process.exit(1);
  }
}

function colorFor(label) {
  // Deterministic per-label hue so each clip is visually distinct in dev.
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  // Convert HSL(hue, 55%, 25%) → ffmpeg hex via a simple lookup-free formula.
  // ffmpeg `color=` accepts named or 0xRRGGBB. Use HSL→RGB inline.
  const s = 0.55, l = 0.25;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (hue < 60) [r1, g1, b1] = [c, x, 0];
  else if (hue < 120) [r1, g1, b1] = [x, c, 0];
  else if (hue < 180) [r1, g1, b1] = [0, c, x];
  else if (hue < 240) [r1, g1, b1] = [0, x, c];
  else if (hue < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const to255 = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "0x" + to255(r1) + to255(g1) + to255(b1);
}

async function makePlaceholder(label, outPath) {
  try {
    await access(outPath, fsConstants.F_OK);
    return false; // already exists
  } catch {}
  // 1.2s solid-color clip; the UI overlays the gloss text on top, so no drawtext.
  const color = colorFor(label);
  await exec("ffmpeg", [
    "-y", "-f", "lavfi", "-i", `color=c=${color}:s=640x360:d=1.2:r=25`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
    outPath,
  ]);
  return true;
}

async function generatePlaceholders() {
  await mkdir(SIGNS_DIR, { recursive: true });
  await mkdir(LETTERS_DIR, { recursive: true });
  await ensureBin("ffmpeg");

  const topWordsRaw = await readFile(join(__dirname, "top-words.json"), "utf8");
  const { words } = JSON.parse(topWordsRaw);

  let made = 0;
  if (!lettersOnly) {
    for (const w of words) {
      const fname = w.toLowerCase() + ".mp4";
      const created = await makePlaceholder(w, join(SIGNS_DIR, fname));
      if (created) {
        made++;
        if (made % 20 === 0) console.log(`  …${made} placeholders so far`);
      }
    }
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  for (const l of letters) {
    const created = await makePlaceholder(l, join(LETTERS_DIR, l.toLowerCase() + ".mp4"));
    if (created) made++;
  }

  console.log(`\n✓ Placeholder library written. New files: ${made}`);
  console.log(`  Next: run \`node scripts/coverage.mjs\` to see coverage.`);
  console.log(`  Replace placeholders with real signer clips when ready (see public/signs/README.md).`);
}

async function fetchWlasl() {
  await ensureBin("ffmpeg");
  await ensureBin("yt-dlp");

  const manifestPath = join(__dirname, "wlasl-urls.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    console.error(`✗ ${manifestPath} not found.`);
    console.error(`  Provide a JSON file shaped like: [{ "gloss": "HELLO", "url": "...", "start": 12.3, "end": 13.5 }, ...]`);
    console.error(`  WLASL provides the YouTube IDs + timestamps; you must supply this manifest yourself.`);
    process.exit(1);
  }

  await mkdir(SIGNS_DIR, { recursive: true });
  for (const entry of manifest) {
    const out = join(SIGNS_DIR, entry.gloss.toLowerCase() + ".mp4");
    try {
      await access(out, fsConstants.F_OK);
      console.log(`  skip ${entry.gloss} (exists)`);
      continue;
    } catch {}
    console.log(`  fetching ${entry.gloss}...`);
    const tmp = out + ".src.mp4";
    await exec("yt-dlp", ["-f", "mp4", "-o", tmp, entry.url]);
    await exec("ffmpeg", [
      "-y", "-ss", String(entry.start ?? 0), "-to", String(entry.end ?? entry.start + 2),
      "-i", tmp, "-c:v", "libx264", "-an", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
    ]);
  }
  console.log(`\n✓ WLASL fetch done.`);
}

if (mode === "wlasl") {
  await fetchWlasl();
} else {
  await generatePlaceholders();
}

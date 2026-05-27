# GOAL — livesignlanguage

> Single source of truth for what we're building. Agents working on this repo should read this file first, do the next undone thing, verify it, then update the **Status log** at the bottom.

---

## 1. Vision (one paragraph)

A web app that takes a **live audio source** (microphone, livestream URL, or video file) and renders, in **near-real-time (≤ 2 seconds end-to-end delay)**, a video of a person signing the spoken content in **American Sign Language (ASL)**. The signer must be linguistically accurate — real ASL grammar, not English-on-hands and not hallucinated AI-video movement. Cost target: **under $0.10 per hour of stream** for the runtime AI calls (transcription + gloss translation).

The product exists to make live content — news streams, conference talks, Twitch streams, classroom lectures — accessible to Deaf/HoH users in real time, without waiting for human interpreter scheduling.

---

## 2. Definition of Done (top-level success criteria)

The project is **done** when **all** of these are simultaneously true on a fresh clone:

| # | Criterion | How to verify |
|---|---|---|
| D1 | `npm install && npm run dev` boots without errors | exit code 0, server listening on :3000 |
| D2 | `npm run build` succeeds | `.next/` produced, no type errors |
| D3 | `npm run typecheck` passes | `tsc --noEmit` exit 0 |
| D4 | Loading `localhost:3000`, clicking **Start**, and speaking a known sentence ("hello how are you") triggers transcription within 1.5 s | manual smoke test, see §6 |
| D5 | Same flow renders ≥ 3 distinct signer clips in sequence (not just text fallback) | manual smoke test |
| D6 | An unknown word (e.g. "Kubernetes") is fingerspelled letter-by-letter | manual smoke test |
| D7 | End-to-end delay from end-of-utterance to first signed clip playing is **≤ 2.0 s p50** measured over 10 utterances | see §6 perf protocol |
| D8 | The signer clip library covers **≥ 200 of the 300 most common English words** (plus 26 fingerspell letters) | `node scripts/coverage.mjs` reports ≥ 200 |
| D9 | A livestream URL (HLS `.m3u8` or YouTube Live link) can be used as input instead of mic | manual test with public HLS sample |
| D10 | README documents setup in ≤ 5 commands and a user with no prior context can get to a working demo | dogfood with a fresh shell |
| D11 | Pushed to `github.com/supthunder/AIvideoASL` on `main` with a working GitHub Actions check that runs typecheck + build | green check on latest commit |

Hitting D1–D8 = **MVP done**. D9–D11 = **v1 done**.

---

## 3. Non-goals (do NOT do these)

- ❌ Generative AI video for the signer (Sora / Veo / Grok Imagine). These are not trained on ASL and will produce convincing-looking-but-wrong signs — actively harmful for accessibility.
- ❌ Building a custom STT model. Use an API.
- ❌ Server-side video stitching with ffmpeg. The browser stitches clips back-to-back via the `<video>` element — server-side encoding adds seconds of latency.
- ❌ Mobile native apps. Web only for now.
- ❌ BSL, Auslan, or other sign languages. ASL only for v1.
- ❌ Per-user accounts, billing, auth. This is a demo-grade app.
- ❌ Speaker diarization, profanity filtering, content moderation.

---

## 4. Architecture (target)

```
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Audio source │───▶│ STT (streaming)  │───▶│ English → gloss  │───▶│ Gloss → clip     │
│ mic | HLS    │    │ Gemini Live or   │    │ Gemini Flash or  │    │ in-memory map +  │
│ | <video>    │    │ Web Speech API   │    │ Claude Haiku     │    │ fingerspell      │
└──────────────┘    └──────────────────┘    └──────────────────┘    └────────┬─────────┘
                                                                             ▼
                                                                  ┌────────────────────┐
                                                                  │ Browser stitches   │
                                                                  │ <video> clip queue │
                                                                  └────────────────────┘
```

**Latency budget (target p50, end of utterance → first signed clip):**

| Stage | Budget |
|---|---|
| STT finalisation | 500 ms |
| English → gloss API call | 250 ms |
| Clip lookup + first frame ready | 100 ms |
| Browser playback start | 150 ms |
| **Total** | **≤ 1000 ms** (≤ 2 s p95) |

**Stack decisions (locked):**

- Next.js 15 App Router + TypeScript + React 19
- Server-side: Node.js runtime (not edge — long-lived WebSockets)
- STT: **Gemini 2.5 Flash Live** for production; Web Speech API as the fallback/dev path
- Gloss: **Gemini 2.5 Flash** via `@google/genai` (cheap, good at structured output)
- Clip library: MP4s under `public/signs/`, sourced from WLASL / ASL Citizen
- Deployment: Vercel (free tier sufficient for demo)

---

## 5. Phased plan

Each phase has a **done test** the agent can run autonomously. Do phases in order. Don't start phase N+1 until phase N's done test passes.

### Phase 0 — Scaffold ✅ (already complete)
- [x] Next.js skeleton, package.json, tsconfig
- [x] `/api/gloss` route using Gemini Flash
- [x] Browser page with mic capture (Web Speech API) and clip player
- [x] README + GOAL files
- **Done test:** files in §10 inventory exist.

### Phase 1 — End-to-end smoke (no real clips yet)
Goal: prove the pipeline works with text fallback.
- [ ] `npm install` succeeds; commit `package-lock.json`
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Smoke run: with `GEMINI_API_KEY` set, speaking "hello how are you" produces gloss like `["HELLO", "HOW", "YOU"]` in the UI within 1.5 s
- **Done test:** `npm run typecheck && npm run build` both exit 0. Manual smoke verified and recorded in Status log.

### Phase 2 — Real clip library (MVP visual)
- [ ] Add `scripts/fetch-clips.mjs` that downloads or generates ≥ 50 core gloss clips into `public/signs/` (HELLO, YES, NO, THANK-YOU, please/sorry, pronouns, 20 common verbs, common adjectives). Source: WLASL videos, trimmed to 1.5 s each, encoded H.264 MP4.
- [ ] Add 26 fingerspell letter clips under `public/signs/letters/`.
- [ ] Add `scripts/coverage.mjs` that reads `lib/clips.ts` and counts gloss→clip hits against a sample top-300-words list (`scripts/top-words.json`).
- [ ] Regenerate `KNOWN_GLOSSES` in `lib/clips.ts` automatically from the filenames in `public/signs/`.
- **Done test:** `node scripts/coverage.mjs` reports ≥ 50 hits. Manual run shows ≥ 3 real signer clips playing for the test sentence.

### Phase 3 — Production STT via Gemini Live
Goal: replace Web Speech API with Gemini 2.5 Flash Live for real-world accuracy and cross-browser support.
- [ ] Add `app/api/stt/route.ts` — Next.js route that upgrades to WebSocket, relays browser PCM audio to Gemini Live, streams back interim+final transcripts.
- [ ] Update `app/page.tsx` to capture raw PCM via `AudioWorklet` and stream over the WS instead of using `webkitSpeechRecognition`.
- [ ] Add a UI toggle: "STT: Web Speech | Gemini Live" so dev mode still works without an API key.
- [ ] Document Gemini Live cost in README (~$0.057/hr).
- **Done test:** With Gemini Live selected, the smoke sentence transcribes and signs correctly in Firefox (Web Speech doesn't work there). p50 end-to-end ≤ 2 s.

### Phase 4 — Performance + measurement
- [ ] Add a `lib/metrics.ts` that timestamps each pipeline stage and pushes a row to a local `localStorage` log per utterance.
- [ ] Add a `/debug` page that shows the last 20 utterance latency breakdowns (STT ms, gloss ms, first-clip-play ms, total).
- [ ] Tune: cache gloss responses for identical text (LRU, 100 entries), pre-load the next clip while the current plays.
- **Done test:** 10 consecutive utterances logged on `/debug` show p50 ≤ 1.0 s, p95 ≤ 2.0 s.

### Phase 5 — Livestream input
- [ ] Add a URL input field accepting HLS (`.m3u8`) and direct MP4 URLs.
- [ ] Capture audio from the `<video>` element via `captureStream()` + `MediaStreamAudioDestinationNode`, feed into the same STT pipeline as the mic.
- [ ] Provide a sample HLS URL in the README that works (e.g. `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`).
- **Done test:** Loading the sample HLS URL renders both the source video and the signer clip stream side-by-side, in sync within 2 s.

### Phase 6 — Ship
- [ ] Add `.github/workflows/ci.yml` running `npm ci && npm run typecheck && npm run build` on push.
- [ ] Push to `github.com/supthunder/AIvideoASL` `main`.
- [ ] Deploy to Vercel; add the live URL to the README.
- [ ] Tag `v0.1.0`.
- **Done test:** GitHub Actions green on `main`. Vercel URL loads. v0.1.0 tag exists.

### Phase 7 — Stretch (only if all above is solid)
- [ ] Background-removed signer overlay (use rembg or @mediapipe/selfie_segmentation) so signer floats in front of the source video instead of side-by-side.
- [ ] Smoother clip transitions: cross-fade or pose-interpolation between clips.
- [ ] Caption track export (WebVTT) so users get text + signer.
- [ ] User-adjustable signer playback speed (0.75×–1.5×).

---

## 6. How to verify (the autonomous loop's playbook)

Before marking a phase done, run **every** check in this section that applies to that phase.

### Build checks (always)
```bash
cd livesignlanguage
npm run typecheck    # must exit 0
npm run build        # must exit 0
```

### Smoke test (Phase 1+)
1. `cp .env.example .env.local` and paste a real `GEMINI_API_KEY`.
2. `npm run dev`, open `http://localhost:3000`.
3. Click **Start**, allow mic, say: *"hello how are you today"*.
4. Within 2 s, the transcript should appear, gloss should be ~`HELLO HOW YOU TODAY`, and the signer panel should play.
5. Say *"my name is Kubernetes"* — the word "Kubernetes" should fingerspell K-U-B-E-R-N-E-T-E-S.

### Latency protocol (Phase 4+)
- 10 utterances of ~5 words each, varied content
- Record `t0` = `onresult.isFinal` timestamp, `t1` = `<video>` `playing` event timestamp
- p50 of `t1 - t0` must be ≤ 1000 ms; p95 ≤ 2000 ms

### Coverage check (Phase 2+)
```bash
node scripts/coverage.mjs
# expected: "Coverage: X / 300 top words (Y%)"  with X ≥ 200 at D8
```

---

## 7. Open decisions (resolve before they block work)

| Q | Status | Notes |
|---|---|---|
| Where do clip MP4s come from for redistribution? | open | WLASL is research-license; need to verify we can host trimmed clips, or self-record from public-domain ASL signers. |
| Do we want Claude (Anthropic) instead of Gemini for the gloss step? | open | Latency similar; Claude Haiku 4.5 may produce cleaner gloss. Cheap A/B once Phase 3 done. |
| Browser support floor? | proposed: Chrome + Firefox latest | Safari Web Speech API is iffy — Gemini Live path (Phase 3) solves that. |
| Hosting cost cap? | not set | Vercel free tier should suffice for demo; Gemini Live cost scales with usage, ~$0.057/hr per active user. |

When a decision is resolved, move it out of this section and into the relevant phase + the architecture lock-ins in §4.

---

## 8. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Web Speech API stops working in Chrome (deprecated/changed) | low | high | Phase 3 (Gemini Live) is the durable path; ship it ASAP. |
| ASL gloss output quality from the LLM is poor | medium | high | Add 10 golden test sentences with hand-written expected gloss in `tests/gloss.test.ts`; assert ≥ 80% word-for-word match. |
| Pre-rendered clips look jerky stitched together | high | medium | Phase 7 cross-fade; accept jerkiness for v1 — content fidelity > smoothness. |
| WLASL licensing prevents redistribution | medium | medium | Fallback: record a small library ourselves, or use Microsoft ASL Citizen (CDLA-Sharing) which permits redistribution. |
| Gemini Live API rate limits at demo time | low | medium | Add Web Speech API toggle as fallback (Phase 3 already includes this). |

---

## 9. Tech reference (so future agents don't re-Google)

- **STT options (2026):**
  - Deepgram Nova-3 / Flux: ~300 ms p95, $0.0043/min — lowest latency
  - ElevenLabs Scribe v2 Realtime: ~150 ms first-partial
  - Gemini 2.5 Flash Live: 500–800 ms, ~$0.057/hr — **chosen** (cheapest, single-vendor with gloss)
  - AssemblyAI Streaming: ~760 ms
- **English → ASL gloss:**
  - Translation task, any modern LLM handles it with a strong system prompt
  - Reference prompt is in `app/api/gloss/route.ts`
- **Clip datasets:**
  - [WLASL](https://github.com/dxli94/WLASL) — ~2000 signs, YouTube-sourced, research license
  - [ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/) — ~2700 signs, CDLA-Sharing-1.0 (redistribution OK)
  - [ASLLVD](http://www.bu.edu/asllrp/av/dai-asllvd.html) — Boston University dataset
- **Reference implementation (architectural inspiration):**
  - [AWS GenASL](https://github.com/aws-samples/genai-asl-avatar-generator) — same pipeline pattern, heavyweight AWS deployment, MIT-0

---

## 10. File inventory (current scaffold)

```
livesignlanguage/
├── GOAL.md                          ← this file
├── README.md
├── package.json
├── tsconfig.json
├── next.config.mjs
├── .gitignore
├── .env.example
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     ← mic capture + clip player
│   ├── globals.css
│   └── api/
│       └── gloss/route.ts           ← English → ASL gloss via Gemini Flash
├── lib/
│   └── clips.ts                     ← gloss → clip URL + fingerspell fallback
└── public/
    └── signs/
        ├── README.md
        └── .gitkeep
```

**Still missing (the agent should add these in phase order):**

- `package-lock.json` (Phase 1, after first `npm install`)
- `scripts/fetch-clips.mjs`, `scripts/coverage.mjs`, `scripts/top-words.json` (Phase 2)
- `public/signs/*.mp4`, `public/signs/letters/*.mp4` (Phase 2)
- `app/api/stt/route.ts` (Phase 3)
- `lib/metrics.ts`, `app/debug/page.tsx` (Phase 4)
- `tests/gloss.test.ts` (risk mitigation)
- `.github/workflows/ci.yml` (Phase 6)

---

## 11. Status log

Newest entry at top. When an agent finishes a unit of work, append one line:

```
YYYY-MM-DD — <phase>.<task> — <what happened> — <next thing to do>
```

---

- **2026-05-27** — Phase 0 — scaffold landed: Next.js + Gemini gloss API + clip player skeleton; Web Speech API for STT baseline — **next: Phase 1, run `npm install` and verify typecheck + build pass**

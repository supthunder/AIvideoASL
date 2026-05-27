# livesignlanguage

Live-transcribe a livestream or microphone input and render a near-real-time ASL signer video alongside it.

Lives in the [supthunder/AIvideoASL](https://github.com/supthunder/AIvideoASL) repo. See [GOAL.md](GOAL.md) for the full build plan and acceptance criteria.

## Architecture

```
mic / livestream audio
        │
        ▼
[ STT: Web Speech API (dev) or Gemini 2.5 Flash Live (prod) ]
        │  English text chunks
        ▼
[ /api/gloss → Gemini 2.5 Flash → ASL gloss ]
        │  e.g. ["HELLO", "HOW", "YOU"]
        ▼
[ lib/clips.ts: gloss → /signs/{gloss}.mp4 ]
   - hit:   /signs/{gloss}.mp4
   - miss:  fingerspell → /signs/letters/{a..z}.mp4
        │
        ▼
[ Browser stitches clips back-to-back ]   target: ≤ 1–2 s delay
```

### Why not generative video (Sora / Veo / Grok Imagine)?

1. Not trained on ASL — output looks like signing but isn't accurate ASL.
2. 30–60 s per 6–10 s clip — 10× slower than real-time.
3. Expensive at livestream scale (~$0.30+/clip).

The pre-rendered clip-library approach (same as AWS GenASL) gives real, correct ASL at near-zero marginal cost.

### Why Gemini Live for STT?

- Cheapest streaming STT at ~$0.057/hr (audio tokens at 32/sec @ $0.50/M).
- Browser-direct WebSocket — no server WS upgrade required, Vercel-deployable.
- Alternative: Deepgram Nova-3 (~300 ms p95) if you need tighter latency.

## Setup

```bash
npm install
cp .env.example .env.local        # paste a GEMINI_API_KEY
npm run fetch:placeholders        # generates 352 placeholder MP4s via ffmpeg (~1 min)
npm run dev
```

Open <http://localhost:3000>.

- **Mic mode + Web Speech** (Chrome): free, instant, default.
- **Mic mode + Gemini Live**: needs `GEMINI_API_KEY`; works in Firefox too.
- **Livestream URL mode**: paste an HLS (`.m3u8`) or MP4 URL — forces Gemini Live STT (Web Speech can't accept a stream).

Visit `/debug` to see per-utterance latency (p50/p95).

## Scripts

| Command | Does what |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run manifest` | Regenerate `lib/clips.generated.ts` from `public/signs/*.mp4` |
| `npm run coverage` | Report gloss coverage vs `scripts/top-words.json` |
| `npm run fetch:placeholders` | Generate solid-colour placeholder clips via ffmpeg |
| `npm run fetch:wlasl` | (Optional) Pull WLASL clips via yt-dlp + ffmpeg |
| `npm run test:gloss "some text"` | Hit `/api/gloss` from the CLI |
| `node tests/gloss.test.mjs` | Run golden gloss tests (needs `GEMINI_API_KEY`) |

## Sign clips

`public/signs/` holds 1.2 s MP4s per gloss; `public/signs/letters/` holds the 26 fingerspell letters.

Out of the box the library is **placeholders** (solid-colour clips, distinct hue per word — the gloss label overlays on top in the UI). To swap in real ASL clips see [public/signs/README.md](public/signs/README.md).

The runtime gloss vocabulary is **auto-generated** from filesystem state by `scripts/gen-clips-manifest.mjs` — drop new MP4s in and they're recognised on the next build.

## Production hardening TODO

- `app/api/stt/token/route.ts` currently returns the raw `GEMINI_API_KEY`. For prod, mint a short-lived ephemeral token instead (`ai.authTokens.create({...})`).
- Add an LRU cache in `/api/gloss` for identical inputs.
- Replace placeholder clips with real signer videos (WLASL / ASL Citizen / self-recorded).
- Background-remove the signer so they overlay the source video instead of sitting beside it.

## Status

Tracked in [GOAL.md](GOAL.md). Phases 0–5 + CI workflow are landed; manual mic/livestream smoke tests and GitHub push are the remaining steps.

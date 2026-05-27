# livesignlanguage

Live-transcribe a livestream or microphone input and render a near-real-time ASL signer video alongside it.

Lives in the [supthunder/AIvideoASL](https://github.com/supthunder/AIvideoASL) repo.

## Architecture

```
mic / livestream audio
        │
        ▼
[ STT: Gemini 2.5 Flash Live ]     ~500–800 ms
        │  English text chunks
        ▼
[ LLM: English → ASL gloss ]        ~150–300 ms
        │  e.g. "HELLO HOW YOU"
        ▼
[ Gloss → clip lookup ]             ~0 ms (in-memory map)
   - hit:   /signs/{gloss}.mp4
   - miss:  fingerspell → /signs/letters/{a..z}.mp4
        │
        ▼
[ Browser stitches clips back-to-back ]   target end-to-end delay: ~1–2 s
```

### Why not generative video (Sora / Veo / Grok Imagine)?

1. Not trained on ASL — output looks like signing but isn't accurate ASL.
2. 30–60 s per 6–10 s clip — 10× slower than real-time.
3. Expensive at livestream scale (~$0.30+/clip).

The pre-rendered clip-library approach (same as AWS GenASL) gives real, correct ASL at near-zero marginal cost.

### Why Gemini Live for STT?

- Cheapest streaming STT at ~$0.057/hr (audio tokens at 32/sec @ $0.50/M).
- Can also do the English→gloss step in the same session — one round-trip.
- Alternative: Deepgram Nova-3 (~300 ms p95) if you need tighter latency.

## Setup

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY
npm run dev
```

Open <http://localhost:3000>, click **Start**, allow microphone access.

The MVP uses the browser Web Speech API for STT (Chrome). The `/api/gloss` route uses Gemini 2.5 Flash for English → ASL gloss.

## Sign clips

Place ASL clips under `public/signs/`. See [public/signs/README.md](public/signs/README.md) for sourcing from WLASL / ASL Citizen.

Until you populate clips, the UI will show the **gloss text** as a fallback so you can verify the STT → gloss pipeline end-to-end.

## Roadmap

- [x] STT → gloss → clip pipeline (browser Web Speech API baseline)
- [ ] Swap STT to Gemini 2.5 Flash Live for production quality
- [ ] Livestream URL input (HLS / YouTube Live ingest)
- [ ] Background-removed signer overlay
- [ ] WLASL clip set bundled

# Sign clip library

Drop signer video clips here. The app looks them up by gloss name.

## Layout

```
public/signs/
  hello.mp4
  yes.mp4
  thank-you.mp4
  ...
  letters/
    a.mp4
    b.mp4
    ...
    z.mp4
```

- One MP4 per gloss, lowercased filename (e.g. `THANK-YOU` → `thank-you.mp4`).
- 26 fingerspell letter clips under `letters/` for words not in the vocabulary.
- Short clips (1–2 s) work best for smooth stitching.

Keep the list of known glosses in [lib/clips.ts](../../lib/clips.ts) in sync with the filenames you have.

## Where to get clips

- **[WLASL](https://github.com/dxli94/WLASL)** — ~2000 ASL signs from YouTube. Largest public dataset.
- **[ASL Citizen](https://www.microsoft.com/en-us/research/project/asl-citizen/)** — ~2700 signs from deaf community contributors. Higher quality, ethically sourced.
- **[ASLLVD](http://www.bu.edu/asllrp/av/dai-asllvd.html)** — Boston University dataset, used by AWS GenASL.
- **[Signing Savvy](https://www.signingsavvy.com/)** — manually license clips for production use.

For a quick demo you only need ~30 clips covering common words plus the 26 letters.

## Quick start with a placeholder set

Until you have real clips, the app shows the gloss as text overlay when a clip is missing, so the pipeline can still be tested end-to-end.

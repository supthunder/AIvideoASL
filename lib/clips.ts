import { KNOWN_GLOSSES } from "./clips.generated";

export type ClipStep =
  | { kind: "sign"; gloss: string; src: string }
  | { kind: "fingerspell"; word: string; letters: { letter: string; src: string }[] };

const FINGERSPELL_BASE = "/signs/letters";
const SIGN_BASE = "/signs";

// Words whose ASL gloss is multi-token; planner emits one sign step covering all of them.
// (Auto-generation can't infer hyphenated gloss filenames cover phrases — keep this short.)
const PHRASE_GLOSSES = new Set<string>(["THANK-YOU", "EXCUSE-ME"]);

export function planClips(glosses: string[]): ClipStep[] {
  const steps: ClipStep[] = [];
  for (const raw of glosses) {
    const gloss = raw.trim().toUpperCase();
    if (!gloss) continue;
    if (KNOWN_GLOSSES.has(gloss) || PHRASE_GLOSSES.has(gloss)) {
      steps.push({ kind: "sign", gloss, src: `${SIGN_BASE}/${gloss.toLowerCase()}.mp4` });
    } else {
      const letters = [...gloss.replace(/[^A-Z]/g, "")].map((letter) => ({
        letter,
        src: `${FINGERSPELL_BASE}/${letter.toLowerCase()}.mp4`,
      }));
      if (letters.length > 0) steps.push({ kind: "fingerspell", word: gloss, letters });
    }
  }
  return steps;
}

export { KNOWN_GLOSSES };

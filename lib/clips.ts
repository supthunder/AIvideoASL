export type ClipStep =
  | { kind: "sign"; gloss: string; src: string }
  | { kind: "fingerspell"; word: string; letters: { letter: string; src: string }[] };

const FINGERSPELL_BASE = "/signs/letters";
const SIGN_BASE = "/signs";

// Stub gloss vocabulary. Replace with a real list generated from your clip library
// (e.g. `ls public/signs/*.mp4`). Anything not in here gets fingerspelled.
const KNOWN_GLOSSES = new Set<string>([
  "HELLO", "YES", "NO", "PLEASE", "THANK-YOU", "SORRY",
  "YOU", "ME", "WE", "HE", "SHE", "THEY",
  "GOOD", "BAD", "HAPPY", "SAD",
  "WHAT", "WHERE", "WHO", "WHY", "HOW",
  "NOW", "TODAY", "TOMORROW", "YESTERDAY",
  "EAT", "DRINK", "GO", "COME", "WANT", "NEED", "HAVE", "LIKE", "LOVE",
]);

export function planClips(glosses: string[]): ClipStep[] {
  const steps: ClipStep[] = [];
  for (const raw of glosses) {
    const gloss = raw.trim().toUpperCase();
    if (!gloss) continue;
    if (KNOWN_GLOSSES.has(gloss)) {
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

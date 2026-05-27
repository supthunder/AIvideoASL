import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const SYSTEM_INSTRUCTION = `You translate English to American Sign Language (ASL) gloss.
ASL gloss is the written form of ASL: UPPERCASE words in ASL grammar order, hyphenated
compounds (e.g. THANK-YOU), no English function words that ASL drops (a, the, is, are).
Output ONLY a JSON object: {"gloss": ["WORD", "WORD", ...]}. No prose, no markdown.`;

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }

  const { text } = (await req.json()) as { text?: string };
  if (!text || !text.trim()) {
    return Response.json({ gloss: [] });
  }

  const ai = new GoogleGenAI({ apiKey });
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: text,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const raw = result.text ?? "{}";
  let gloss: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.gloss)) gloss = parsed.gloss.map(String);
  } catch {
    // Fall back to whitespace split if the model misbehaves.
    gloss = raw.replace(/[^A-Za-z\-\s]/g, "").trim().split(/\s+/);
  }

  return Response.json({ gloss });
}

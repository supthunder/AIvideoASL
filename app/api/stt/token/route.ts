// Issues a credential the browser uses to connect to Gemini Live.
//
// DEV: returns the raw GEMINI_API_KEY. Convenient but means anyone who can
//      load the page can extract the key from network inspector.
// PROD: should mint a short-lived ephemeral token via the Gemini API
//      (`ai.authTokens.create({ expireTime, ... })` in @google/genai)
//      and return only the token. TODO before deploying.

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY not set" }, { status: 500 });
  }
  return Response.json({ apiKey });
}

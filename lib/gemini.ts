import { GoogleGenAI } from "@google/genai";

// Server-only, same guard as lib/db.ts. The Profile agent parses a PDF with
// this client; Match/Roadmap (other lanes) use MODEL_AGENT with Google Search
// grounding for anything current about VT or an employer.
if (typeof window !== "undefined") {
  throw new Error("lib/gemini.ts must never reach the client bundle");
}

export const MODEL_PARSE = "gemini-2.5-pro";
export const MODEL_AGENT = "gemini-2.5-flash";

let client: GoogleGenAI | undefined;

/** The one Gemini client. Throws loudly when the key is missing -- no default, no silent skip. */
export function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

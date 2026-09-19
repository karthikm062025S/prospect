import { GoogleGenAI } from "@google/genai";

// Server-only, same guard as lib/db.ts. The Profile agent parses a PDF with
// this client; Match/Roadmap (other lanes) use MODEL_AGENT with Google Search
// grounding for anything current about VT or an employer.
if (typeof window !== "undefined") {
  throw new Error("lib/gemini.ts must never reach the client bundle");
}

// Model policy (Karthik 2026-09-19 16:00, SETUP-DONE §2): agents on 3.8 Flash, PDF parse on 3.1 Pro (preview id),
// bulk labelling on 3.1 Flash-Lite with grounding OFF. gemini-2.5-* is refused for this key ("no longer available").
export const MODEL_PARSE = "gemini-3.1-pro-preview";
export const MODEL_AGENT = "gemini-3.8-flash";
export const MODEL_LABEL = "gemini-3.1-flash-lite";

let client: GoogleGenAI | undefined;

/** The one Gemini client. Throws loudly when the key is missing -- no default, no silent skip. */
export function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

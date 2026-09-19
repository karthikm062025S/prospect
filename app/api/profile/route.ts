import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUid } from "@/lib/require-user";
import { runProfileAgent, ProfileFormSchema, encodeStepLine, type ProfileForm } from "@/lib/agents/profile";

// Streams NDJSON: one line per agent step, then {"done":true} or {"error":"<named message>"}.
// 401 (no session) and 400 (bad form, field named) return before any stream starts; anything
// else that goes wrong DURING the agent run (missing GEMINI_API_KEY/LAKEBASE_URL, a failed
// Gemini call, a rejected profile) becomes a named {"error":...} line -- the client is already
// mid-stream at that point, so it can never become an HTTP status.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Named refusal before buffering: Vercel's own body limit (~4.5 MB) would
// otherwise answer with an anonymous platform 413 (security validation 2026-09-19).
const MAX_PDF_BYTES = 4 * 1024 * 1024;

async function readFile(form: FormData, field: string): Promise<Uint8Array | undefined> {
  const value = form.get(field);
  if (!(value instanceof File) || value.size === 0) return undefined;
  if (value.size > MAX_PDF_BYTES) {
    throw new Error(`FILE_TOO_LARGE: ${field} is ${(value.size / 1024 / 1024).toFixed(1)} MB; the limit is 4 MB`);
  }
  if (value.type && value.type !== "application/pdf") {
    throw new Error(`FILE_NOT_PDF: ${field} is ${value.type}; upload a PDF`);
  }
  return new Uint8Array(await value.arrayBuffer());
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = resolveUid(user);
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const form = await request.formData();
    const profileRaw = form.get("profile");
    if (typeof profileRaw !== "string") {
      return NextResponse.json({ error: "Missing form field: profile" }, { status: 400 });
    }
    let parsedForm: ProfileForm;
    try {
      parsedForm = ProfileFormSchema.parse(JSON.parse(profileRaw));
    } catch (error) {
      return NextResponse.json({ error: `Invalid form field: profile (${(error as Error).message})` }, { status: 400 });
    }

    const typedCourses = typeof form.get("typedCourses") === "string" ? (form.get("typedCourses") as string) : undefined;
    const resumePdf = await readFile(form, "resume");
    const transcriptPdf = await readFile(form, "transcript");
    if (!transcriptPdf && !typedCourses?.trim()) {
      return NextResponse.json(
        { error: "Missing form field: transcript (upload a PDF or type your courses instead)" },
        { status: 400 },
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          await runProfileAgent(
            { userId, resumePdf, transcriptPdf, typedCourses, form: parsedForm },
            (step) => controller.enqueue(encoder.encode(encodeStepLine(step))),
          );
          controller.enqueue(encoder.encode(`${JSON.stringify({ done: true })}\n`));
        } catch (error) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ error: (error as Error).message })}\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

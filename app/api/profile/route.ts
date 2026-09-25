import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUid } from "@/lib/require-user";
import { runProfileAgent, ProfileFormSchema, encodeStepLine, type ProfileForm } from "@/lib/agents/profile";
import { runMatchAgent } from "@/lib/agents/match";
import { runRoadmapAgent } from "@/lib/agents/roadmap";
import { runProfilePipeline } from "@/lib/agents/harness";
import { query } from "@/lib/db";

// Streams NDJSON: one line per step in the fixed order transcript, resume,
// profile, match, roadmap -- each {step, label, count} with a real count -- then {"done":true},
// or one named {"error":"..."} line after the steps already emitted and nothing more.
// 401 (no session) and 400 (bad form, field named) return before any stream starts; anything
// else that goes wrong DURING the agent run (missing GEMINI_API_KEY/LAKEBASE_URL, a failed
// Gemini call, a rejected profile) becomes a named {"error":...} line -- the client is already
// mid-stream at that point, so it can never become an HTTP status.
export const dynamic = "force-dynamic";
// Honest ceiling: every model call inside the three agents has its own 20 s named timeout
// (lib/agents/harness.ts); the worst serial path is profile (2 parallel parses, 20 s) +
// roadmap (certifications 20 s + plan 20 s) + match's tail after it waits on roadmapDone
// (before-you-apply + the score write, DB only; match's own model calls run in parallel with
// roadmap) plus the DB/vector work around them, so 120 s holds without hiding a slow model.
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
          await runProfilePipeline(
            {
              profile: (onStep) => runProfileAgent({ userId, resumePdf, transcriptPdf, typedCourses, form: parsedForm }, onStep),
              match: (roadmapDone) => runMatchAgent({ userId, roadmapDone }, query, () => {}),
              roadmap: () => runRoadmapAgent({ userId }, () => {}),
            },
            (line) => controller.enqueue(encoder.encode("step" in line ? encodeStepLine(line) : `${JSON.stringify(line)}\n`)),
          );
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

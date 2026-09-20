import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUid } from "@/lib/require-user";
import { isCorrectPassword } from "@/lib/gate";
import { query } from "@/lib/db";
import { resolveMatchAuth } from "@/lib/match-auth";
import { runMatchAgent, encodeStepLine, assignArchetypesBatch, labelTopPostings } from "@/lib/agents/match";
import { topScores } from "@/lib/match-scores";
import { insertNudge } from "@/lib/nudges";

// Two branches (brief §5): (a) a signed-in user streams NDJSON steps for
// their own re-rank; (b) the Databricks Orchestrator (X-Watcher-Secret,
// ?all=1) re-scores every profile hourly and writes "new_drop" nudges for
// postings that are new since the user's last run and now land in their top
// 20. Both absent -> 401 (lib/match-auth.ts resolveMatchAuth, unit-tested
// separately since this file imports next/server, which node --test cannot
// resolve). Job text is data (mapPostingTasks/requirements prompts, both
// inside runMatchAgent) -- nothing here catches and continues past a real
// per-profile error; the watcher branch collects per-profile errors by name
// and keeps going to the next profile, exactly like app/api/watcher/route.ts
// does per-row.
//
// Speed pass (build/MISSION-speed-2026-09-20.md): the user branch never
// assigns archetypes in bulk (D-S1) and never labels tasks inline (D-S3) --
// labels for the top 20 run in `after()` once the stream has finished. The
// watcher branch tops up archetype assignment (<=200 postings, concurrency
// 2) once per run and labels the top 40 per profile inline.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TOP_N_FOR_NUDGES = 20;
const LABEL_USER = { limit: 20, concurrency: 2 } as const;
const LABEL_WATCHER = { limit: 40, concurrency: 2 } as const;
const ASSIGN_WATCHER = { limit: 200, concurrency: 2 } as const;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const auth = resolveMatchAuth(
    {
      userId: resolveUid(user),
      all,
      secretHeader: request.headers.get("X-Watcher-Secret"),
      expectedSecret: process.env.WATCHER_SECRET,
    },
    isCorrectPassword,
  );

  if (auth.kind === "unauthorized") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (auth.kind === "user") {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          await runMatchAgent({ userId: auth.userId }, query, (step) =>
            controller.enqueue(encoder.encode(encodeStepLine(step))),
          );
          controller.enqueue(encoder.encode(`${JSON.stringify({ done: true })}\n`));
          // Labels for the top 20 fill in after the response; a failure is
          // logged by name and never reaches the stream.
          try {
            after(() =>
              labelTopPostings(query, auth.userId, LABEL_USER).catch((error: Error) =>
                console.error(`labelTopPostings: ${error.message}`),
              ),
            );
          } catch (error) {
            console.error(`labelTopPostings: after() unavailable: ${(error as Error).message}`);
          }
        } catch (error) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ error: (error as Error).message })}\n`));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
  }

  // auth.kind === "watcher": re-score every profile, hand the caller a JSON
  // summary (no streaming -- this is a server-to-server hourly job, not a
  // browser tab watching progress).
  // ALLOWLIST (tests/user-scoping.test.ts): this is the one legitimate
  // service-tier enumeration of every profile row, the same shape as that
  // file's existing feedback-server.ts entries -- the Orchestrator job has no
  // single owner to scope to, by design.
  const profileRows = await query<{ user_id: string }>("select user_id from profiles", [], "profiles");

  let rescored = 0;
  let nudges = 0;
  let labelled = 0;
  const errors: string[] = [];

  // Capped archetype top-up (D-S1): the backlog itself is scripts/assign-archetypes.mjs.
  let assigned = { assigned: 0, remaining: -1 };
  try {
    assigned = await assignArchetypesBatch(query, ASSIGN_WATCHER);
  } catch (error) {
    errors.push(`assignArchetypesBatch: ${(error as Error).message}`);
  }

  for (const { user_id: userId } of profileRows) {
    try {
      const previous = await topScores(query, userId, TOP_N_FOR_NUDGES);
      const previousIds = new Set(previous.map((row) => row.role_id));
      const previousRunAt = previous.reduce<string | null>(
        (max, row) => (max === null || row.created_at > max ? row.created_at : max),
        null,
      );

      await runMatchAgent({ userId }, query, () => {});
      labelled += (await labelTopPostings(query, userId, LABEL_WATCHER)).labelled;

      if (previousRunAt) {
        const newTop = await topScores(query, userId, TOP_N_FOR_NUDGES);
        const newlyRanked = newTop.filter((row) => !previousIds.has(row.role_id));
        if (newlyRanked.length > 0) {
          const roleIds = newlyRanked.map((row) => row.role_id);
          const freshRoles = await query<{ id: string; title: string }>(
            "select id, title from roles where id = any($1::uuid[]) and created_at > $2",
            [roleIds, previousRunAt],
            "roles",
          );
          for (const role of freshRoles) {
            const scoreRow = newlyRanked.find((row) => row.role_id === role.id);
            await insertNudge(query, {
              user_id: userId,
              role_id: role.id,
              kind: "new_drop",
              title: `New match: ${role.title}`,
              body: `${role.title} just dropped and ranks in your top ${TOP_N_FOR_NUDGES}.`,
              evidence: scoreRow?.reasons ?? [],
              agent_run_id: scoreRow?.agent_run_id ?? null,
            });
            nudges += 1;
          }
        }
      }
      rescored += 1;
    } catch (error) {
      errors.push(`${userId}: ${(error as Error).message}`);
    }
  }

  return NextResponse.json({
    profiles: profileRows.length,
    rescored,
    nudges,
    labelled,
    archetypes_assigned: assigned.assigned,
    archetypes_remaining: assigned.remaining,
    errors,
  });
}

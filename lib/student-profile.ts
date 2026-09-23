import type { query } from "./db";
import type { ProfileOutput } from "./agents/profile";
// Node's test runner loads this file directly (tests/student-profile.test.ts,
// tests/ans-gate.test.ts) and needs the explicit extension to resolve it;
// allowImportingTsExtensions (tsconfig.json) makes tsc accept the suffix.
import { assertVerifiedAgent } from "./ans-verify.ts";

// ponytail: "./db" is imported as a TYPE only above (erased at runtime, so it
// never trips the node --experimental-strip-types cross-lib import gotcha).
// The real `query` is loaded with a dynamic import inside each function below,
// only when the caller does not inject its own (tests always inject a fake).
type QueryFn = typeof query;

async function realQuery(): Promise<QueryFn> {
  return (await import("./db")).query;
}

export type StoredProfile = {
  user_id: string;
  profile: ProfileOutput;
  major: string | null;
  grad_term: string | null;
  work_authorization: string | null;
  goal: string | null;
  target_term: string | null;
  role_types: string[] | null;
  dream_tier: string[] | null;
  agent_run_id: string | null;
  updated_at: string;
};

export async function upsertProfile(
  userId: string,
  profile: ProfileOutput,
  agentRunId: string,
  runQuery?: QueryFn,
): Promise<void> {
  const q = runQuery ?? (await realQuery());
  await q(
    `insert into profiles
       (user_id, profile, major, grad_term, work_authorization, goal, target_term, role_types, dream_tier, agent_run_id, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     on conflict (user_id) do update set
       profile = excluded.profile,
       major = excluded.major,
       grad_term = excluded.grad_term,
       work_authorization = excluded.work_authorization,
       goal = excluded.goal,
       target_term = excluded.target_term,
       role_types = excluded.role_types,
       dream_tier = excluded.dream_tier,
       agent_run_id = excluded.agent_run_id,
       updated_at = now()`,
    [
      userId,
      JSON.stringify(profile),
      profile.major,
      profile.gradTerm,
      profile.workAuthorization,
      profile.goal,
      `${profile.targetTerm.season} ${profile.targetTerm.year}`,
      profile.roleTypes,
      profile.dreamTier,
      agentRunId,
    ],
    "profiles",
  );
}

export async function getProfile(userId: string, runQuery?: QueryFn): Promise<StoredProfile | null> {
  const q = runQuery ?? (await realQuery());
  const rows = await q<StoredProfile>("select * from profiles where user_id = $1", [userId], "profiles");
  return rows[0] ?? null;
}

// D10 (2026-09-22 security tightening): open signup + shared demo logins let a
// stranger loop Gemini + Vector Search with no cap. RUN_CAP_PER_HOUR bounds one
// user_id across every agent (not per-agent), since the abuse is total spend.
const RUN_CAP_PER_HOUR = 5;

/**
 * Read-only precheck so a caller that cannot surface startAgentRun's error as
 * a real HTTP status (an already-open NDJSON stream) can refuse BEFORE opening
 * one. startAgentRun below is still the atomic, race-safe enforcement.
 */
export async function isRunCapped(userId: string, runQuery?: QueryFn): Promise<boolean> {
  const q = runQuery ?? (await realQuery());
  const rows = await q<{ capped: boolean }>(
    `select exists (select 1 from agent_runs where user_id = $1 and status = 'running')
       or (select count(*) from agent_runs where user_id = $1 and started_at > now() - interval '1 hour') >= ${RUN_CAP_PER_HOUR}
       as capped`,
    [userId],
    "agent_runs",
  );
  return rows[0]?.capped ?? false;
}

export async function startAgentRun(agent: string, userId: string, runQuery?: QueryFn): Promise<string> {
  // L5 D21: the ANS gate runs before any write.
  await assertVerifiedAgent(agent);

  const q = runQuery ?? (await realQuery());
  // One atomic insert: refuses (0 rows back) when the user already has a
  // 'running' row or hit the hourly cap, instead of a separate check-then-insert
  // that a concurrent request could race past.
  const rows = await q<{ id: string }>(
    `insert into agent_runs (agent, user_id, status)
     select $1, $2, 'running'
     where not exists (select 1 from agent_runs where user_id = $2 and status = 'running')
       and (select count(*) from agent_runs where user_id = $2 and started_at > now() - interval '1 hour') < ${RUN_CAP_PER_HOUR}
     returning id`,
    [agent, userId],
    "agent_runs",
  );
  if (rows.length === 0) {
    throw new Error(`RUN_LIMIT (${agent}): too many runs for this user in the last hour; wait and try again`);
  }
  return rows[0].id;
}

export async function finishAgentRun(
  id: string,
  result: { status: "ok" | "error"; error?: string; counts?: Record<string, number> },
  runQuery?: QueryFn,
): Promise<void> {
  const q = runQuery ?? (await realQuery());
  await q(
    "update agent_runs set status = $2, error = $3, counts = $4, finished_at = now() where id = $1",
    [id, result.status, result.error ?? null, result.counts ? JSON.stringify(result.counts) : null],
    "agent_runs",
  );
}

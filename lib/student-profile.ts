import { createRequire } from "node:module";
import type { query } from "./db";
import type { ProfileOutput } from "./agents/profile";
import type * as AnsVerify from "./ans-verify";

// require(), not import(): see the ponytail comment on startAgentRun below.
const ansVerifyRequire = createRequire(import.meta.url);

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

export async function startAgentRun(agent: string, userId: string, runQuery?: QueryFn): Promise<string> {
  // ponytail: NOT the "./db" pattern above (an extensionless `await import(...)`
  // that tests skip by always injecting a fake) -- this check always runs, so
  // that lazy resolution would throw ERR_MODULE_NOT_FOUND the moment a test
  // calls startAgentRun directly under `node --experimental-strip-types`
  // (extensionless and ".ts"-suffixed `import()` were both proven to fail
  // here; `require("./ans-verify.ts")` is the one form Node resolves AND tsc
  // accepts, since a require() argument is a plain string, not a
  // TS5097-checked import specifier). The type import above keeps this typed.
  const { assertVerifiedAgent } = ansVerifyRequire("./ans-verify.ts") as typeof AnsVerify;
  await assertVerifiedAgent(agent);

  const q = runQuery ?? (await realQuery());
  const rows = await q<{ id: string }>(
    "insert into agent_runs (agent, user_id, status) values ($1, $2, 'running') returning id",
    [agent, userId],
    "agent_runs",
  );
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

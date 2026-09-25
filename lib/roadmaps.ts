import type { query } from "./db";

// note: "./db" and "./catalog" are reached only through `import type` or a
// deferred `await import(...)` below, never a static value import -- the same
// pattern lib/student-profile.ts documents: a static extensionless VALUE
// import between two lib/*.ts files throws ERR_MODULE_NOT_FOUND the moment
// `node --experimental-strip-types --test` loads a test that imports THIS
// file directly. Tests always inject their own query function.
type QueryFn = typeof query;

async function realQuery(): Promise<QueryFn> {
  return (await import("./db")).query;
}

export type NodeKind = "course" | "club" | "project" | "certification";
export type NodeStatus = "suggested" | "planned" | "done";

export interface Roadmap {
  id: string;
  user_id: string;
  goal: string | null;
  target_term: string;
  agent_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoadmapNode {
  id: string;
  roadmap_id: string;
  user_id: string;
  semester: string;
  kind: NodeKind;
  ref_code: string | null;
  ref_name: string | null;
  title: string;
  why: string;
  unlocks_tasks: unknown[];
  moves_toward: string[];
  source_url: string | null;
  status: NodeStatus;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export async function getRoadmap(userId: string, runQuery?: QueryFn): Promise<Roadmap | null> {
  const q = runQuery ?? (await realQuery());
  const rows = await q<Roadmap>("select * from roadmaps where user_id = $1", [userId], "roadmaps");
  return rows[0] ?? null;
}

export async function upsertRoadmap(
  userId: string,
  input: { goal: string | null; targetTerm: string; agentRunId: string },
  runQuery?: QueryFn,
): Promise<Roadmap> {
  const q = runQuery ?? (await realQuery());
  const rows = await q<Roadmap>(
    `insert into roadmaps (user_id, goal, target_term, agent_run_id, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (user_id) do update set
       goal = excluded.goal,
       target_term = excluded.target_term,
       agent_run_id = excluded.agent_run_id,
       updated_at = now()
     returning *`,
    [userId, input.goal, input.targetTerm, input.agentRunId],
    "roadmaps",
  );
  return rows[0];
}

export async function listNodes(userId: string, roadmapId: string, runQuery?: QueryFn): Promise<RoadmapNode[]> {
  const q = runQuery ?? (await realQuery());
  return q<RoadmapNode>(
    "select * from roadmap_nodes where user_id = $1 and roadmap_id = $2 order by semester, position",
    [userId, roadmapId],
    "roadmap_nodes",
  );
}

/**
 * Clears every 'suggested' node in the given semesters so the agent can
 * re-plan them -- a node the student marked planned/done, or one in a
 * semester outside this list, is never touched (CONTEXT "the Roadmap agent
 * re-plans later semesters").
 */
export async function deleteFutureNodes(
  userId: string,
  roadmapId: string,
  semesters: readonly string[],
  runQuery?: QueryFn,
): Promise<void> {
  if (semesters.length === 0) return;
  const q = runQuery ?? (await realQuery());
  await q(
    "delete from roadmap_nodes where user_id = $1 and roadmap_id = $2 and semester = any($3::text[]) and status = 'suggested'",
    [userId, roadmapId, semesters],
    "roadmap_nodes",
  );
}

export async function setNodeStatus(
  userId: string,
  nodeId: string,
  status: NodeStatus,
  runQuery?: QueryFn,
): Promise<void> {
  const q = runQuery ?? (await realQuery());
  await q(
    "update roadmap_nodes set status = $3, updated_at = now() where id = $1 and user_id = $2",
    [nodeId, userId, status],
    "roadmap_nodes",
  );
}

export async function setNodeNotes(userId: string, nodeId: string, notes: string, runQuery?: QueryFn): Promise<void> {
  const q = runQuery ?? (await realQuery());
  await q(
    "update roadmap_nodes set notes = $3, updated_at = now() where id = $1 and user_id = $2",
    [nodeId, userId, notes],
    "roadmap_nodes",
  );
}

export interface NewNode {
  roadmapId: string;
  semester: string;
  kind: NodeKind;
  refCode?: string | null;
  refName?: string | null;
  title: string;
  why: string;
  movesToward?: string[];
  sourceUrl?: string | null;
  position?: number;
}

/** Inserts one node, re-validating a course/club ref against the live catalog first (rule 3: never trust the caller). */
export async function addNode(userId: string, input: NewNode, runQuery?: QueryFn): Promise<RoadmapNode> {
  const q = runQuery ?? (await realQuery());
  if (input.kind === "course") {
    if (!input.refCode) throw new Error("addNode: a course node requires ref_code");
    const { courseCodesExist } = await import("./catalog");
    const found = await courseCodesExist([input.refCode]);
    if (!found.has(input.refCode)) throw new Error(`Course not found in catalog: ${input.refCode}`);
  } else if (input.kind === "club") {
    if (!input.refName) throw new Error("addNode: a club node requires ref_name");
    const { clubNamesExist } = await import("./catalog");
    const found = await clubNamesExist([input.refName]);
    if (!found.has(input.refName)) throw new Error(`Club not found in catalog: ${input.refName}`);
  } else if (input.kind === "certification" && !input.sourceUrl) {
    throw new Error("addNode: a certification node requires source_url");
  }

  const rows = await q<RoadmapNode>(
    `insert into roadmap_nodes
       (roadmap_id, user_id, semester, kind, ref_code, ref_name, title, why, moves_toward, source_url, status, position)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, 'suggested', $11)
     returning *`,
    [
      input.roadmapId,
      userId,
      input.semester,
      input.kind,
      input.refCode ?? null,
      input.refName ?? null,
      input.title,
      input.why,
      JSON.stringify(input.movesToward ?? []),
      input.sourceUrl ?? null,
      input.position ?? 0,
    ],
    "roadmap_nodes",
  );
  return rows[0];
}

export async function deleteNode(userId: string, nodeId: string, runQuery?: QueryFn): Promise<void> {
  const q = runQuery ?? (await realQuery());
  await q("delete from roadmap_nodes where id = $1 and user_id = $2", [nodeId, userId], "roadmap_nodes");
}

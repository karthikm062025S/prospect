import type { QueryResultRow } from "pg";

// lib/db.ts does not export QueryFn yet (L0 is adding it as part of the port).
// This structural type matches lib/db.ts's `query` export exactly, so passing
// `query` from lib/db.ts satisfies it with no runtime import — tests inject a
// pglite-backed function instead (see tests/nudges.test.ts).
export type QueryFn = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
  table?: string,
) => Promise<T[]>;

export type NudgeKind = "new_drop" | "replan" | "deadline";

export type Nudge = {
  id: string;
  user_id: string;
  role_id: string | null;
  kind: NudgeKind;
  title: string;
  body: string;
  evidence: unknown;
  agent_run_id: string | null;
  created_at: string;
  read_at: string | null;
};

export type InsertNudgeInput = {
  user_id: string;
  role_id?: string | null;
  kind: NudgeKind;
  title: string;
  body: string;
  evidence?: unknown;
  agent_run_id?: string | null;
};

/** Newest-first nudges for one user; `unreadOnly` uses the partial index. */
export async function listNudges(
  q: QueryFn,
  userId: string,
  opts: { unreadOnly?: boolean } = {},
): Promise<Nudge[]> {
  const text = opts.unreadOnly
    ? `select * from nudges where user_id = $1 and read_at is null order by created_at desc`
    : `select * from nudges where user_id = $1 order by created_at desc`;
  return q<Nudge>(text, [userId], "nudges");
}

/** Marks one nudge read, scoped to its owner. Returns null if no row matched (wrong id or wrong owner). */
export async function markNudgeRead(q: QueryFn, userId: string, id: string): Promise<Nudge | null> {
  const rows = await q<Nudge>(
    `update nudges set read_at = now() where id = $1 and user_id = $2 returning *`,
    [id, userId],
    "nudges",
  );
  return rows[0] ?? null;
}

/** Inserts one nudge (Orchestrator / Match agent write path) and returns the row. */
export async function insertNudge(q: QueryFn, nudge: InsertNudgeInput): Promise<Nudge> {
  const rows = await q<Nudge>(
    `insert into nudges (user_id, role_id, kind, title, body, evidence, agent_run_id)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [
      nudge.user_id,
      nudge.role_id ?? null,
      nudge.kind,
      nudge.title,
      nudge.body,
      JSON.stringify(nudge.evidence ?? {}),
      nudge.agent_run_id ?? null,
    ],
    "nudges",
  );
  return rows[0];
}

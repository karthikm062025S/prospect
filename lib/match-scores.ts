import type { QueryResultRow } from "pg";

// Structural stand-in for lib/db.ts's `query` export (same copy every other
// lane's SQL module carries -- lib/nudges.ts, lib/archetypes.ts,
// lib/posting-tasks.ts -- so production passes `query`/a transaction's bound
// `q` untouched and tests inject a pglite-backed function instead).
export type QueryFn = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
  table?: string,
) => Promise<T[]>;

export type MatchScore = {
  user_id: string;
  role_id: string;
  score: number;
  archetype_similarity: number | null;
  level_match: boolean | null;
  tier_match: boolean | null;
  reasons: string[];
  requirements_met: string[];
  requirements_unknown: string[];
  requirements_checked: boolean;
  before_you_apply: unknown[];
  target_archetype: string | null;
  agent_run_id: string | null;
  created_at: string;
};

export type MatchScoreInput = {
  role_id: string;
  score: number;
  archetype_similarity: number | null;
  level_match: boolean | null;
  tier_match: boolean | null;
  reasons: string[];
  requirements_met: string[];
  requirements_unknown: string[];
  requirements_checked: boolean;
  before_you_apply: unknown[];
  target_archetype: string | null;
  agent_run_id: string | null;
};

const COLUMNS_PER_ROW = 12;

/** Every match_scores row for one user, best match first. */
export async function listScores(q: QueryFn, userId: string): Promise<MatchScore[]> {
  return q<MatchScore>(
    "select * from match_scores where user_id = $1 order by score desc",
    [userId],
    "match_scores",
  );
}

/** The top `n` match_scores rows for one user, best match first. */
export async function topScores(q: QueryFn, userId: string, n: number): Promise<MatchScore[]> {
  return q<MatchScore>(
    "select * from match_scores where user_id = $1 order by score desc limit $2",
    [userId, n],
    "match_scores",
  );
}

/**
 * Replaces the FULL set of match_scores rows for one user: delete then insert
 * in one call. Atomicity (the delete and the insert landing or rolling back
 * together) comes from the CALLER wrapping this in lib/db.ts withTransaction
 * (lib/agents/match.ts does exactly that) -- this function itself only issues
 * the two statements against whatever QueryFn it is given, transaction-bound
 * or not, exactly like lib/posting-tasks.ts mapPostingTasks's delete-then-insert
 * on role_tasks.
 */
export async function replaceScores(q: QueryFn, userId: string, rows: readonly MatchScoreInput[]): Promise<void> {
  await q("delete from match_scores where user_id = $1", [userId], "match_scores");
  if (rows.length === 0) return;

  const values: string[] = [];
  const params: unknown[] = [userId];
  rows.forEach((row, i) => {
    const base = 1 + i * COLUMNS_PER_ROW;
    values.push(
      `($1, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`,
    );
    params.push(
      row.role_id,
      row.score,
      row.archetype_similarity,
      row.level_match,
      row.tier_match,
      JSON.stringify(row.reasons),
      JSON.stringify(row.requirements_met),
      JSON.stringify(row.requirements_unknown),
      row.requirements_checked,
      JSON.stringify(row.before_you_apply),
      row.target_archetype,
      row.agent_run_id,
    );
  });

  await q(
    `insert into match_scores
       (user_id, role_id, score, archetype_similarity, level_match, tier_match, reasons,
        requirements_met, requirements_unknown, requirements_checked, before_you_apply,
        target_archetype, agent_run_id)
     values ${values.join(", ")}`,
    params,
    "match_scores",
  );
}

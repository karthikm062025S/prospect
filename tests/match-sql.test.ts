import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { listScores, topScores, replaceScores, type QueryFn, type MatchScoreInput } from "../lib/match-scores.ts";

const MATCH_SQL = fs.readFileSync("db/lakebase/006-match.sql", "utf8");
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const ROLE_1 = "33333333-3333-3333-3333-333333333333";
const ROLE_2 = "44444444-4444-4444-4444-444444444444";
const ROLE_3 = "55555555-5555-5555-5555-555555555555";

async function makeDb(): Promise<{ db: PGlite; q: QueryFn }> {
  const db = new PGlite();
  // Structural stand-in for the FK only (zero content rows) -- the no-mock-data
  // rule governs product surfaces, not a unit test's schema scaffolding
  // (tests/nudges.test.ts and tests/archetypes-sql.test.ts do the same).
  await db.exec(`create table roles (id uuid primary key);`);
  await db.exec(MATCH_SQL);
  const q: QueryFn = async (text, params = []) => {
    const result = await db.query(text, params as unknown[]);
    return result.rows as never[];
  };
  return { db, q };
}

function row(roleId: string, score: number): MatchScoreInput {
  return {
    role_id: roleId,
    score,
    archetype_similarity: 0.8,
    level_match: true,
    tier_match: false,
    reasons: ["posted today"],
    requirements_met: [],
    requirements_unknown: [],
    requirements_checked: false,
    before_you_apply: [],
    target_archetype: "Backend Software Engineer",
    agent_run_id: null,
  };
}

test("006-match.sql applies cleanly and is idempotent (create table if not exists)", async () => {
  const db = new PGlite();
  await db.exec(`create table roles (id uuid primary key);`);
  await db.exec(MATCH_SQL);
  await db.exec(MATCH_SQL); // re-apply must not throw
  const tables = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  assert.ok(tables.rows.map((r) => r.table_name).includes("match_scores"));
});

test("replaceScores inserts the full set; listScores/topScores are scoped to the owner, best score first", async () => {
  const { db, q } = await makeDb();
  await db.query(`insert into roles (id) values ($1), ($2), ($3)`, [ROLE_1, ROLE_2, ROLE_3]);

  await replaceScores(q, USER_A, [row(ROLE_1, 0.4), row(ROLE_2, 0.9)]);
  await replaceScores(q, USER_B, [row(ROLE_3, 0.5)]);

  const a = await listScores(q, USER_A);
  assert.equal(a.length, 2);
  assert.equal(a[0].role_id, ROLE_2); // best score first
  assert.equal(a[0].target_archetype, "Backend Software Engineer");

  const b = await listScores(q, USER_B);
  assert.equal(b.length, 1);
  assert.equal(b[0].role_id, ROLE_3);

  const top1 = await topScores(q, USER_A, 1);
  assert.equal(top1.length, 1);
  assert.equal(top1[0].role_id, ROLE_2);
});

test("replaceScores replaces the FULL prior set for that user (delete then insert), never appends", async () => {
  const { db, q } = await makeDb();
  await db.query(`insert into roles (id) values ($1), ($2)`, [ROLE_1, ROLE_2]);

  await replaceScores(q, USER_A, [row(ROLE_1, 0.4)]);
  await replaceScores(q, USER_A, [row(ROLE_2, 0.9)]);

  const rows = await listScores(q, USER_A);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].role_id, ROLE_2);
});

test("replaceScores is atomic: a failing row inside the caller's transaction leaves the previous set intact", async () => {
  const { db, q } = await makeDb();
  await db.query(`insert into roles (id) values ($1)`, [ROLE_1]);
  await replaceScores(q, USER_A, [row(ROLE_1, 0.4)]);

  // Mimics lib/db.ts withTransaction's BEGIN/fn/COMMIT-or-rollback contract
  // using pglite's own .transaction() (proven to roll back on throw).
  const badRow = row("not-a-real-uuid-and-not-in-roles", 0.9);
  await assert.rejects(
    db.transaction(async (tx) => {
      const txQ: QueryFn = async (text, params = []) => {
        const result = await tx.query(text, params as unknown[]);
        return result.rows as never[];
      };
      await replaceScores(txQ, USER_A, [badRow]);
    }),
  );

  const rows = await listScores(q, USER_A);
  assert.equal(rows.length, 1, "the previous set must survive a rolled-back replace");
  assert.equal(rows[0].role_id, ROLE_1);
});

test("replaceScores with an empty array deletes the prior set and leaves nothing (a student with zero live postings)", async () => {
  const { db, q } = await makeDb();
  await db.query(`insert into roles (id) values ($1)`, [ROLE_1]);
  await replaceScores(q, USER_A, [row(ROLE_1, 0.4)]);
  await replaceScores(q, USER_A, []);
  const rows = await listScores(q, USER_A);
  assert.equal(rows.length, 0);
});

test("replaceScores writes a feed larger than pg's 65,535-parameter statement cap (13 params/row -> chunked inserts)", async () => {
  const { q } = await makeDb();
  const n = 5500;
  await q(`insert into roles (id) select gen_random_uuid() from generate_series(1, ${n})`);
  const ids = await q<{ id: string }>("select id from roles");
  await replaceScores(q, USER_A, ids.map((r, i) => row(r.id, i / n)));
  const [{ count }] = await q<{ count: number }>("select count(*)::int as count from match_scores where user_id = $1", [USER_A]);
  assert.equal(count, n);
});

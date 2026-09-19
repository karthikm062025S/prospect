import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { insertNudge, listNudges, markNudgeRead, type QueryFn } from "../lib/nudges.ts";

const NUDGES_SQL = fs.readFileSync("db/lakebase/003-nudges.sql", "utf8");

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

// Structural stand-in for the FK only (zero rows of content, no real posting data) —
// allowed under the no-mock-data rule, which governs product surfaces, not a
// unit test's schema scaffolding.
async function makeDb(): Promise<QueryFn> {
  const db = new PGlite();
  await db.exec(`create table roles (id uuid primary key);`);
  await db.exec(NUDGES_SQL);
  return async (text, params = []) => {
    const result = await db.query(text, params as unknown[]);
    return result.rows as never[];
  };
}

test("insert then list returns the nudge for its owner and not for another user", async () => {
  const q = await makeDb();
  const nudge = await insertNudge(q, {
    user_id: USER_A,
    kind: "new_drop",
    title: "New match",
    body: "A role matching your goal just dropped.",
  });

  const mine = await listNudges(q, USER_A);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, nudge.id);
  assert.equal(mine[0].read_at, null);

  const theirs = await listNudges(q, USER_B);
  assert.equal(theirs.length, 0);
});

test("markNudgeRead flips read_at only for the owner", async () => {
  const q = await makeDb();
  const nudge = await insertNudge(q, {
    user_id: USER_A,
    kind: "replan",
    title: "Roadmap updated",
    body: "Your Fall plan re-ranked after a new drop.",
  });

  const deniedForOther = await markNudgeRead(q, USER_B, nudge.id);
  assert.equal(deniedForOther, null);

  const stillUnreadForOwner = await listNudges(q, USER_A, { unreadOnly: true });
  assert.equal(stillUnreadForOwner.length, 1);

  const updated = await markNudgeRead(q, USER_A, nudge.id);
  assert.ok(updated);
  assert.ok(updated?.read_at);

  const noLongerUnread = await listNudges(q, USER_A, { unreadOnly: true });
  assert.equal(noLongerUnread.length, 0);
});

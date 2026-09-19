import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  getRoadmap,
  upsertRoadmap,
  listNodes,
  setNodeStatus,
  setNodeNotes,
  deleteNode,
  deleteFutureNodes,
  addNode,
  type RoadmapNode,
} from "../lib/roadmaps.ts";

// Runs the REAL migration against a real (in-memory WASM) Postgres, per the
// km-db/km-test proof rule: RLS does not exist in Lakebase (one DB role), so
// "isolation" here means the app-layer `where user_id = $n` in lib/roadmaps.ts
// actually holds against a real schema, not a mocked query function.
async function freshDb() {
  const db = new PGlite();
  const sql = readFileSync(new URL("../db/lakebase/004-roadmaps.sql", import.meta.url), "utf-8");
  await db.exec(sql);
  const q = (async (text: string, params: unknown[] = []) => {
    const result = await db.query(text, params);
    return result.rows;
  }) as unknown as Parameters<typeof getRoadmap>[1];
  return q!;
}

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "44444444-4444-4444-4444-444444444444";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

async function insertNode(q: NonNullable<Parameters<typeof getRoadmap>[1]>, roadmapId: string, userId: string, overrides: Partial<{ semester: string; status: string; title: string }> = {}) {
  const rows = await q<{ id: string }>(
    `insert into roadmap_nodes (roadmap_id, user_id, semester, kind, title, why, status)
     values ($1, $2, $3, 'project', $4, 'because', $5) returning id`,
    [roadmapId, userId, overrides.semester ?? "Fall 2026", overrides.title ?? "a project", overrides.status ?? "suggested"],
  );
  return (rows[0] as { id: string }).id;
}

test("upsertRoadmap creates one row per user and getRoadmap reads it back", async () => {
  const q = await freshDb();
  const roadmap = await upsertRoadmap(USER_A, { goal: "SWE internship", targetTerm: "Summer 2027", agentRunId: RUN_ID }, q);
  assert.ok(roadmap.id);
  assert.equal(roadmap.target_term, "Summer 2027");
  const fetched = await getRoadmap(USER_A, q);
  assert.equal(fetched?.id, roadmap.id);
});

test("upsertRoadmap on the same user updates in place, never a second row", async () => {
  const q = await freshDb();
  await upsertRoadmap(USER_A, { goal: "A", targetTerm: "Fall 2026", agentRunId: RUN_ID }, q);
  const second = await upsertRoadmap(USER_A, { goal: "B", targetTerm: "Spring 2027", agentRunId: RUN_ID }, q);
  const rows = await q<{ n: string }>("select count(*) as n from roadmaps where user_id = $1", [USER_A]);
  assert.equal(Number(rows[0].n), 1);
  assert.equal(second.goal, "B");
});

test("user A cannot read user B's nodes through listNodes", async () => {
  const q = await freshDb();
  const roadmapA = await upsertRoadmap(USER_A, { goal: null, targetTerm: "Fall 2026", agentRunId: RUN_ID }, q);
  await insertNode(q, roadmapA.id, USER_A);

  const asB = await listNodes(USER_B, roadmapA.id, q);
  assert.deepEqual(asB, []);
  const asA = await listNodes(USER_A, roadmapA.id, q);
  assert.equal(asA.length, 1);
});

test("user B cannot modify user A's node through setNodeStatus, setNodeNotes, or deleteNode", async () => {
  const q = await freshDb();
  const roadmapA = await upsertRoadmap(USER_A, { goal: null, targetTerm: "Fall 2026", agentRunId: RUN_ID }, q);
  const nodeId = await insertNode(q, roadmapA.id, USER_A);

  await setNodeStatus(USER_B, nodeId, "done", q);
  let row = await q<{ status: string }>("select status from roadmap_nodes where id = $1", [nodeId]);
  assert.equal(row[0].status, "suggested");

  await setNodeNotes(USER_B, nodeId, "hijacked", q);
  row = await q("select notes from roadmap_nodes where id = $1", [nodeId]);
  assert.equal((row[0] as unknown as { notes: string | null }).notes, null);

  await deleteNode(USER_B, nodeId, q);
  const stillThere = await q("select id from roadmap_nodes where id = $1", [nodeId]);
  assert.equal(stillThere.length, 1);

  // The true owner can modify it -- proves the WHERE clause is the reason
  // user B failed above, not a schema-level accident.
  await setNodeStatus(USER_A, nodeId, "done", q);
  row = await q<{ status: string }>("select status from roadmap_nodes where id = $1", [nodeId]);
  assert.equal(row[0].status, "done");
});

test("deleteFutureNodes keeps planned/done nodes and nodes outside the given semesters", async () => {
  const q = await freshDb();
  const roadmap = await upsertRoadmap(USER_A, { goal: null, targetTerm: "Summer 2027", agentRunId: RUN_ID }, q);
  await insertNode(q, roadmap.id, USER_A, { semester: "Fall 2026", status: "suggested", title: "kept: earlier semester" });
  await insertNode(q, roadmap.id, USER_A, { semester: "Spring 2027", status: "planned", title: "kept: planned" });
  await insertNode(q, roadmap.id, USER_A, { semester: "Spring 2027", status: "suggested", title: "removed: suggested in range" });

  await deleteFutureNodes(USER_A, roadmap.id, ["Spring 2027", "Summer 2027"], q);
  const remaining = await listNodes(USER_A, roadmap.id, q);
  assert.deepEqual(
    remaining.map((n: RoadmapNode) => n.title).sort(),
    ["kept: earlier semester", "kept: planned"],
  );
});

test("deleteFutureNodes never touches another user's rows", async () => {
  const q = await freshDb();
  const roadmapA = await upsertRoadmap(USER_A, { goal: null, targetTerm: "Fall 2026", agentRunId: RUN_ID }, q);
  await insertNode(q, roadmapA.id, USER_A, { semester: "Fall 2026", status: "suggested" });

  await deleteFutureNodes(USER_B, roadmapA.id, ["Fall 2026"], q);
  const stillThere = await listNodes(USER_A, roadmapA.id, q);
  assert.equal(stillThere.length, 1);
});

test("addNode rejects a course node with no ref_code before touching the catalog", async () => {
  const q = await freshDb();
  const roadmap = await upsertRoadmap(USER_A, { goal: null, targetTerm: "Fall 2026", agentRunId: RUN_ID }, q);
  await assert.rejects(
    addNode(USER_A, { roadmapId: roadmap.id, semester: "Fall 2026", kind: "course", title: "x", why: "x" }, q),
    /addNode: a course node requires ref_code/,
  );
});

test("addNode rejects a certification node with no source_url", async () => {
  const q = await freshDb();
  const roadmap = await upsertRoadmap(USER_A, { goal: null, targetTerm: "Fall 2026", agentRunId: RUN_ID }, q);
  await assert.rejects(
    addNode(USER_A, { roadmapId: roadmap.id, semester: "Fall 2026", kind: "certification", title: "x", why: "x" }, q),
    /addNode: a certification node requires source_url/,
  );
});

test("addNode accepts a project node with no ref and no catalog check", async () => {
  const q = await freshDb();
  const roadmap = await upsertRoadmap(USER_A, { goal: null, targetTerm: "Fall 2026", agentRunId: RUN_ID }, q);
  const node = await addNode(USER_A, { roadmapId: roadmap.id, semester: "Fall 2026", kind: "project", title: "Build a tracker", why: "practice" }, q);
  assert.equal(node.status, "suggested");
  assert.equal(node.ref_code, null);
});

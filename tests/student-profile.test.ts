import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertProfile, getProfile, startAgentRun, finishAgentRun, isRunCapped } from "../lib/student-profile.ts";
import type { ProfileOutput } from "../lib/agents/profile.ts";

const PROFILE: ProfileOutput = {
  major: "Computer Science",
  gradTerm: "Spring 2028",
  workAuthorization: "F-1 (CPT/OPT)",
  courses: [{ code: "CS 3114", title: "Data Structures and Algorithms" }],
  skills: ["TypeScript"],
  experiences: [{ org: "Acme", title: "SWE Intern", summary: "Built things." }],
  roleTypes: ["internship"],
  targetTerm: { season: "Summer", year: 2027 },
  goal: "Land a backend SWE internship.",
  dreamTier: ["FAANG"],
};

function fakeQuery<T>(rows: T[] = []) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fn = async (text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    return rows as T[];
  };
  return { fn: fn as unknown as typeof import("../lib/db.ts").query, calls };
}

// A minimal in-memory agent_runs table, evaluating the same conditions
// startAgentRun's insert and isRunCapped's select apply (a 'running' row less
// than 10 minutes old, or >= 15 rows started in the last hour), so the cap
// tests below exercise the real refusal logic rather than a canned response.
// `rows` is exposed so a test can seed a stale 'running' row directly.
function fakeAgentRunsDb() {
  const rows: Array<{ id: string; user_id: string; status: string; started_at: number }> = [];
  let nextId = 1;
  const capped = (userId: string) =>
    rows.some((r) => r.user_id === userId && r.status === "running" && r.started_at > Date.now() - 10 * 60 * 1000) ||
    rows.filter((r) => r.user_id === userId && r.started_at > Date.now() - 60 * 60 * 1000).length >= 15;
  const fn = async (text: string, params: unknown[] = []) => {
    if (text.includes("insert into agent_runs")) {
      const [, userId] = params as [string, string];
      if (capped(userId)) return [];
      const id = `run-${nextId++}`;
      rows.push({ id, user_id: userId, status: "running", started_at: Date.now() });
      return [{ id }];
    }
    if (text.includes("update agent_runs set status")) {
      const [id, status] = params as [string, string];
      const row = rows.find((r) => r.id === id);
      if (row) row.status = status;
      return [];
    }
    if (text.includes("as capped")) {
      const [userId] = params as [string];
      return [{ capped: capped(userId) }];
    }
    throw new Error(`fakeAgentRunsDb: unhandled query: ${text}`);
  };
  return { fn: fn as unknown as typeof import("../lib/db.ts").query, rows };
}

test("upsertProfile writes an on-conflict(user_id) upsert with the user id as $1", async () => {
  const { fn, calls } = fakeQuery();
  await upsertProfile("user-1", PROFILE, "run-1", fn);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /on conflict \(user_id\)/i);
  assert.equal(calls[0].params[0], "user-1");
  assert.equal(calls[0].params[6], "Summer 2027");
});

test("getProfile scopes the select by user_id as $1", async () => {
  const { fn, calls } = fakeQuery([{ user_id: "user-1" }]);
  const row = await getProfile("user-1", fn);
  assert.equal(calls[0].params[0], "user-1");
  assert.match(calls[0].text, /where user_id = \$1/i);
  assert.deepEqual(row, { user_id: "user-1" });
});

test("getProfile returns null when no row exists", async () => {
  const { fn } = fakeQuery([]);
  const row = await getProfile("user-none", fn);
  assert.equal(row, null);
});

test("startAgentRun inserts a running row and returns its id", async () => {
  const { fn, calls } = fakeQuery([{ id: "run-1" }]);
  const id = await startAgentRun("profile", "user-1", fn);
  assert.equal(id, "run-1");
  assert.match(calls[0].text, /'running'/);
  assert.deepEqual(calls[0].params, ["profile", "user-1"]);
});

test("finishAgentRun writes the status and error by run id", async () => {
  const { fn, calls } = fakeQuery();
  await finishAgentRun("run-1", { status: "error", error: "GEMINI_API_KEY is not set" }, fn);
  assert.deepEqual(calls[0].params, ["run-1", "error", "GEMINI_API_KEY is not set", null]);
});

test("startAgentRun refuses a 16th run within the hour (D10 run cap, 15 = ~5 full pipelines)", async () => {
  const { fn } = fakeAgentRunsDb();
  for (let i = 0; i < 15; i++) {
    const id = await startAgentRun("match", "user-1", fn);
    await finishAgentRun(id, { status: "ok" }, fn);
  }
  await assert.rejects(() => startAgentRun("match", "user-1", fn), /RUN_LIMIT/);
  // A different user is unaffected by user-1's cap.
  await assert.doesNotReject(() => startAgentRun("match", "user-2", fn));
});

test("startAgentRun refuses a concurrent run while one is still 'running' (D10 run cap)", async () => {
  const { fn } = fakeAgentRunsDb();
  await startAgentRun("match", "user-1", fn);
  await assert.rejects(() => startAgentRun("match", "user-1", fn), /RUN_LIMIT/);
});

test("startAgentRun does NOT lock the user out when a 'running' row is older than 10 minutes", async () => {
  // A run the Vercel timeout killed, or one on roadmap.ts's error path
  // (no finishAgentRun there), leaves a 'running' row behind forever;
  // it must stop counting as live once it's stale.
  const { fn, rows } = fakeAgentRunsDb();
  rows.push({ id: "stale-run", user_id: "user-1", status: "running", started_at: Date.now() - 11 * 60 * 1000 });
  await assert.doesNotReject(() => startAgentRun("match", "user-1", fn));
});

test("isRunCapped reports the same cap read-only, without inserting a row", async () => {
  const { fn } = fakeAgentRunsDb();
  assert.equal(await isRunCapped("user-1", fn), false);
  await startAgentRun("match", "user-1", fn);
  assert.equal(await isRunCapped("user-1", fn), true);
});

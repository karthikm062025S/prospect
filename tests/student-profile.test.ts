import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertProfile, getProfile, startAgentRun, finishAgentRun } from "../lib/student-profile.ts";
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

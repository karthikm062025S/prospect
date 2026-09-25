import { test } from "node:test";
import assert from "node:assert/strict";
import { requireProfile } from "../lib/require-user.ts";
import type { StoredProfile } from "../lib/student-profile.ts";
import { STEP_KEYS, applyStreamEvent, initialSteps } from "../components/setup/profile-stream.ts";

// UI/UX mission C2: /setup is mandatory
// until a profile row exists. requireProfile takes an injected lookup + redirect
// so the gate is proven without Next or Lakebase in the test process.

const ROW = { user_id: "user-1", updated_at: "2026-09-19T00:00:00Z" } as StoredProfile;

function fakeRedirect() {
  const calls: string[] = [];
  const redirect = (url: string): never => {
    calls.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  };
  return { redirect, calls };
}

test("requireProfile with no profile row redirects to /setup and never returns", async () => {
  const { redirect, calls } = fakeRedirect();
  await assert.rejects(
    requireProfile("user-1", { getProfile: async () => null, redirect }),
    /NEXT_REDIRECT \/setup/,
  );
  assert.deepEqual(calls, ["/setup"]);
});

test("requireProfile with a row returns it, scoped to the given user, without redirecting", async () => {
  const { redirect, calls } = fakeRedirect();
  const seen: string[] = [];
  const row = await requireProfile("user-1", {
    getProfile: async (uid) => {
      seen.push(uid);
      return ROW;
    },
    redirect,
  });
  assert.equal(row, ROW);
  assert.deepEqual(seen, ["user-1"]);
  assert.deepEqual(calls, []);
});

test("requireProfile lets a Lakebase failure stay loud instead of redirecting", async () => {
  const { redirect, calls } = fakeRedirect();
  await assert.rejects(
    requireProfile("user-1", {
      getProfile: async () => {
        throw new Error("LAKEBASE_URL is not set");
      },
      redirect,
    }),
    /LAKEBASE_URL/,
  );
  assert.deepEqual(calls, []);
});

// The client's NDJSON reducer (D-UI3): five fixed steps, done -> /journey,
// error -> the running step carries the named message.

test("the stream has exactly the five step keys in order", () => {
  assert.deepEqual([...STEP_KEYS], ["transcript", "resume", "profile", "match", "roadmap"]);
  const states = initialSteps();
  assert.equal(states.transcript.status, "running");
  assert.equal(states.roadmap.status, "pending");
});

test("a step event marks that step done with its count and starts the next one", () => {
  const { states, navigateTo } = applyStreamEvent(initialSteps(), { step: "transcript", label: "14 courses found", count: 14 });
  assert.deepEqual(states.transcript, { status: "done", label: "14 courses found", count: 14 });
  assert.equal(states.resume.status, "running");
  assert.equal(navigateTo, undefined);
});

test("done sends the client to /journey", () => {
  const { navigateTo } = applyStreamEvent(initialSteps(), { done: true });
  assert.equal(navigateTo, "/journey");
});

test("an error lands on the step that was running, by name", () => {
  let states = initialSteps();
  states = applyStreamEvent(states, { step: "transcript", label: "14 courses found", count: 14 }).states;
  states = applyStreamEvent(states, { step: "resume", label: "6 skills found", count: 6 }).states;
  const out = applyStreamEvent(states, { error: "GEMINI_TIMEOUT: profile did not answer in 10 s" });
  assert.deepEqual(out.states.profile, { status: "error", message: "GEMINI_TIMEOUT: profile did not answer in 10 s" });
  assert.equal(out.states.match.status, "pending");
  assert.equal(out.error, "GEMINI_TIMEOUT: profile did not answer in 10 s");
  assert.equal(out.navigateTo, undefined);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMatchAuth } from "../lib/match-auth.ts";

const alwaysTrue = () => true;
const alwaysFalse = () => false;

test("no session and no secret -> unauthorized", () => {
  const decision = resolveMatchAuth(
    { userId: null, all: false, secretHeader: null, expectedSecret: "real-secret" },
    alwaysFalse,
  );
  assert.deepEqual(decision, { kind: "unauthorized" });
});

test("no session, all=1, but the secret comparison fails -> unauthorized", () => {
  const decision = resolveMatchAuth(
    { userId: null, all: true, secretHeader: "wrong", expectedSecret: "real-secret" },
    alwaysFalse,
  );
  assert.deepEqual(decision, { kind: "unauthorized" });
});

test("no session, all=1, no WATCHER_SECRET configured -> unauthorized (never compares against undefined)", () => {
  const decision = resolveMatchAuth(
    { userId: null, all: true, secretHeader: "anything", expectedSecret: undefined },
    alwaysTrue,
  );
  assert.deepEqual(decision, { kind: "unauthorized" });
});

test("no session, all=1, correct secret -> watcher", () => {
  const decision = resolveMatchAuth(
    { userId: null, all: true, secretHeader: "real-secret", expectedSecret: "real-secret" },
    alwaysTrue,
  );
  assert.deepEqual(decision, { kind: "watcher" });
});

test("a signed-in user always wins, even if all=1 and a secret happen to be present", () => {
  const decision = resolveMatchAuth(
    { userId: "user-123", all: true, secretHeader: "real-secret", expectedSecret: "real-secret" },
    alwaysTrue,
  );
  assert.deepEqual(decision, { kind: "user", userId: "user-123" });
});

test("a signed-in user with no secret at all -> user branch, not unauthorized", () => {
  const decision = resolveMatchAuth(
    { userId: "user-123", all: false, secretHeader: null, expectedSecret: "real-secret" },
    alwaysFalse,
  );
  assert.deepEqual(decision, { kind: "user", userId: "user-123" });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveUid } from "../lib/require-user.ts";

test("resolveUid returns the authenticated user's id", () => {
  assert.equal(resolveUid({ id: "user-123" }), "user-123");
});

test("resolveUid returns null when there is no authenticated user", () => {
  assert.equal(resolveUid(null), null);
  assert.equal(resolveUid(undefined), null);
});

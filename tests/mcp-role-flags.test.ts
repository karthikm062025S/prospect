import { test } from "node:test";
import assert from "node:assert/strict";
import { nyTodayStartIso, buildRoleFlagsPatch } from "../lib/mcp-helpers.ts";

test("nyTodayStartIso returns midnight America/New_York as a UTC instant (EDT, UTC-4)", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  assert.equal(nyTodayStartIso(now), "2026-08-24T04:00:00.000Z");
});

test("nyTodayStartIso returns midnight America/New_York as a UTC instant (EST, UTC-5)", () => {
  const now = new Date("2026-01-15T12:00:00Z");
  assert.equal(nyTodayStartIso(now), "2026-01-15T05:00:00.000Z");
});

test("nyTodayStartIso rolls back a date when NY is still on the previous calendar day", () => {
  // 2026-08-24T02:00:00Z is 2026-08-23T22:00:00-04:00 in New York — still Aug 23 there.
  const now = new Date("2026-08-24T02:00:00Z");
  assert.equal(nyTodayStartIso(now), "2026-08-23T04:00:00.000Z");
});

test("buildRoleFlagsPatch rejects when neither flag is given", () => {
  assert.equal(buildRoleFlagsPatch({}), null);
});

test("buildRoleFlagsPatch sets saved_at to now when saved: true", () => {
  const now = "2026-08-24T12:00:00.000Z";
  assert.deepEqual(buildRoleFlagsPatch({ saved: true }, now), { saved_at: now });
});

test("buildRoleFlagsPatch clears saved_at when saved: false", () => {
  const now = "2026-08-24T12:00:00.000Z";
  assert.deepEqual(buildRoleFlagsPatch({ saved: false }, now), { saved_at: null });
});

test("buildRoleFlagsPatch sets hidden_at to now when hidden: true", () => {
  const now = "2026-08-24T12:00:00.000Z";
  assert.deepEqual(buildRoleFlagsPatch({ hidden: true }, now), { hidden_at: now });
});

test("buildRoleFlagsPatch handles both flags at once", () => {
  const now = "2026-08-24T12:00:00.000Z";
  assert.deepEqual(buildRoleFlagsPatch({ saved: true, hidden: false }, now), {
    saved_at: now,
    hidden_at: null,
  });
});

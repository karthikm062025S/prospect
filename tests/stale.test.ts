import { test } from "node:test";
import assert from "node:assert/strict";
import { STALE_DAYS, isStale } from "../lib/stale.ts";

const NOW = new Date("2026-08-23T12:00:00Z").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

test("STALE_DAYS is 21", () => {
  assert.equal(STALE_DAYS, 21);
});

test("stale statuses just past the boundary (21 days + 1ms) are stale", () => {
  const changedAt = new Date(NOW - (21 * DAY_MS + 1)).toISOString();
  for (const status of ["applied", "oa", "interviewing"]) {
    assert.equal(isStale({ status, status_changed_at: changedAt }, NOW), true, status);
  }
});

test("statuses just inside the boundary (21 days - 1ms) are NOT stale", () => {
  const changedAt = new Date(NOW - (21 * DAY_MS - 1)).toISOString();
  for (const status of ["applied", "oa", "interviewing"]) {
    assert.equal(isStale({ status, status_changed_at: changedAt }, NOW), false, status);
  }
});

test("exactly 21 days is NOT stale (< per TRD, not <=)", () => {
  const changedAt = new Date(NOW - 21 * DAY_MS).toISOString();
  assert.equal(isStale({ status: "applied", status_changed_at: changedAt }, NOW), false);
});

test("rejected/offer/withdrawn are never stale regardless of age", () => {
  const changedAt = new Date(NOW - 100 * DAY_MS).toISOString();
  for (const status of ["rejected", "offer", "withdrawn"]) {
    assert.equal(isStale({ status, status_changed_at: changedAt }, NOW), false, status);
  }
});

test("null status_changed_at floors to false even for a stale-eligible status", () => {
  assert.equal(isStale({ status: "applied", status_changed_at: null }, NOW), false);
});

test("defaults nowMs to Date.now() when omitted", () => {
  const changedAt = new Date(Date.now() - 100 * DAY_MS).toISOString();
  assert.equal(isStale({ status: "applied", status_changed_at: changedAt }), true);
});

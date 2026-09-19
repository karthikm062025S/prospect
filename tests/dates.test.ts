import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate } from "../lib/dashboard.ts";

// The whole point of formatDate: a date-only string must render as the SAME
// calendar day it stores, in any timezone. new Date("2026-07-14") would parse as
// UTC midnight and render Jul 13 in ET — the off-by-one this replaces.
test("date-only string keeps its exact day", () => {
  assert.equal(formatDate("2026-07-14"), "Jul 14, 2026");
  assert.equal(formatDate("2026-01-01"), "Jan 1, 2026");
  assert.equal(formatDate("2026-12-31"), "Dec 31, 2026");
});

test("timestamp uses its date portion", () => {
  assert.equal(formatDate("2026-07-14T23:30:00Z"), "Jul 14, 2026");
});

test("null / empty / unparseable are handled", () => {
  assert.equal(formatDate(null), "Not recorded");
  assert.equal(formatDate(undefined), "Not recorded");
  assert.equal(formatDate(""), "Not recorded");
  assert.equal(formatDate("garbage"), "garbage");
});

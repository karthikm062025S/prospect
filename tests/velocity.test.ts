import { test } from "node:test";
import assert from "node:assert/strict";
import { velocity, addedToday } from "../lib/velocity.ts";

const NOW = new Date("2026-08-23T12:00:00Z").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

test("target defaults to null when omitted", () => {
  assert.equal(velocity([], NOW).target, null);
});

test("target is returned as given when passed", () => {
  assert.equal(velocity([], NOW, 25).target, 25);
});

test("an app dated exactly 6 days ago counts in week", () => {
  const sixDaysAgo = new Date(NOW - 6 * DAY_MS).toISOString().slice(0, 10);
  const result = velocity([{ date_applied: sixDaysAgo }], NOW);
  assert.equal(result.week, 1);
});

test("an app dated 7 days ago does NOT count in week", () => {
  const sevenDaysAgo = new Date(NOW - 7 * DAY_MS).toISOString().slice(0, 10);
  const result = velocity([{ date_applied: sevenDaysAgo }], NOW);
  assert.equal(result.week, 0);
});

test("an app on the 1st of the month counts in month", () => {
  const result = velocity([{ date_applied: "2026-08-01" }], NOW);
  assert.equal(result.month, 1);
});

test("an app on the last day of the previous month does NOT count in month", () => {
  const result = velocity([{ date_applied: "2026-07-31" }], NOW);
  assert.equal(result.month, 0);
});

test("null date_applied is ignored in both counts", () => {
  const result = velocity([{ date_applied: null }, { date_applied: "2026-08-01" }], NOW);
  assert.equal(result.week, 0);
  assert.equal(result.month, 1);
});

test("today's date counts in both week and month", () => {
  const today = new Date(NOW).toISOString().slice(0, 10);
  const result = velocity([{ date_applied: today }], NOW);
  assert.equal(result.week, 1);
  assert.equal(result.month, 1);
});

test("empty applications list yields zero counts", () => {
  const result = velocity([], NOW);
  assert.deepEqual(result, { today: 0, week: 0, month: 0, target: null });
});

test("defaults nowMs to Date.now() when omitted", () => {
  const today = new Date().toISOString().slice(0, 10);
  const result = velocity([{ date_applied: today }]);
  assert.equal(result.week, 1);
});

// --- today (v5 counts strip) ---
test("today counts only applications dated today", () => {
  const today = new Date(NOW).toISOString().slice(0, 10);
  const yesterday = new Date(NOW - DAY_MS).toISOString().slice(0, 10);
  const result = velocity([{ date_applied: today }, { date_applied: today }, { date_applied: yesterday }], NOW);
  assert.equal(result.today, 2);
  assert.equal(result.week, 3);
});

test("today ignores nulls and a timestamped date_applied still matches on its date part", () => {
  const today = new Date(NOW).toISOString().slice(0, 10);
  const result = velocity([{ date_applied: null }, { date_applied: `${today}T18:00:00Z` }], NOW);
  assert.equal(result.today, 1);
});

// --- addedToday (v5 counts strip) ---
// America/New_York calendar days — ONE fixed zone so the server render and the
// client recount can never disagree. Fixtures are UTC instants on purpose.
const NY_NOON = new Date("2026-08-24T16:00:00Z").getTime(); // 12:00 ET, Aug 24

test("addedToday counts roles created on the NY calendar day, both edges included", () => {
  const roles = [
    { created_at: "2026-08-24T04:00:00Z" }, // 00:00 ET Aug 24
    { created_at: "2026-08-25T03:59:00Z" }, // 23:59 ET Aug 24
    { created_at: "2026-08-24T03:59:00Z" }, // 23:59 ET Aug 23 — yesterday
  ];
  assert.equal(addedToday(roles, NY_NOON), 2);
});

// The hydration bug this replaced: 01:30Z on Aug 24 is 21:30 ET on Aug 23, so
// a UTC "today" counted it on Aug 24 while the ET reader did not.
test("addedToday: an evening-ET drop belongs to the ET day, not the UTC one", () => {
  const evening = [{ created_at: "2026-08-24T01:30:00Z" }];
  assert.equal(addedToday(evening, new Date("2026-08-24T02:00:00Z").getTime()), 1);
  assert.equal(addedToday(evening, new Date("2026-08-24T16:00:00Z").getTime()), 0);
});

test("addedToday: nothing added today is zero, and an empty list is zero", () => {
  assert.equal(addedToday([{ created_at: "2026-08-20T16:00:00Z" }], NY_NOON), 0);
  assert.equal(addedToday([], NY_NOON), 0);
});

test("addedToday ignores an unparseable created_at instead of throwing", () => {
  assert.equal(addedToday([{ created_at: "nope" }, { created_at: "2026-08-24T16:00:00Z" }], NY_NOON), 1);
});

// --- velocity's own NY boundary ("applied today" = the NY calendar date) ---
test("velocity.today uses the NY calendar date, not the UTC one", () => {
  // 2026-08-24T02:00:00Z is 22:00 ET on Aug 23.
  const evening = new Date("2026-08-24T02:00:00Z").getTime();
  assert.equal(velocity([{ date_applied: "2026-08-23" }], evening).today, 1);
  assert.equal(velocity([{ date_applied: "2026-08-24" }], evening).today, 0);
});

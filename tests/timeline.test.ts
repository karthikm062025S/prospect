import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTimeline,
  chipCounts,
  chipMatches,
  filterByChip,
  isManualEntry,
  parseChip,
} from "../lib/applications-list.ts";

function ev(id: string, at: string, over: Record<string, unknown> = {}) {
  return {
    id,
    application_id: "app-1",
    company_id: "co-1",
    kind: "other" as const,
    subject: id,
    sender: "you",
    received_at: at,
    snippet: null,
    classified_by: "user" as const,
    created_at: at,
    company_name: "Example",
    ...over,
  };
}

test("chips: closed folds rejected and legacy withdrawn statuses", () => {
  assert.equal(chipMatches("closed", "rejected"), true);
  assert.equal(chipMatches("closed", "withdrawn"), true);
  assert.equal(chipMatches("closed", "offer"), false);
  assert.equal(chipMatches("all", "withdrawn"), true);
});

test("chip counts add up to the total", () => {
  const rows = [
    { status: "applied" as const },
    { status: "oa" as const },
    { status: "interviewing" as const },
    { status: "offer" as const },
    { status: "rejected" as const },
    { status: "withdrawn" as const },
  ];
  const counts = chipCounts(rows);
  assert.equal(counts.all, 6);
  assert.equal(counts.closed, 2);
  assert.equal(counts.applied + counts.oa + counts.interviewing + counts.offer + counts.closed, counts.all);
});

test("filterByChip keeps everything on all and never mutates input", () => {
  const rows = [{ status: "oa" as const }, { status: "offer" as const }];
  assert.equal(filterByChip(rows, "all").length, 2);
  assert.deepEqual(filterByChip(rows, "offer"), [{ status: "offer" }]);
  assert.equal(rows.length, 2);
});

test("parseChip falls back to all for unknown URL values", () => {
  assert.equal(parseChip("oa"), "oa");
  assert.equal(parseChip("OA"), "oa");
  assert.equal(parseChip("nonsense"), "all");
  assert.equal(parseChip(null), "all");
});

test("timeline lists only user-written entries, newest first", () => {
  const items = buildTimeline([
    ev("email", "2026-08-19T09:00:00+00:00", { classified_by: "rule" }),
    ev("m1", "2026-08-12T09:00:00+00:00"),
    ev("m2", "2026-08-21T09:00:00+00:00"),
  ]);
  assert.deepEqual(items.map((item) => item.id), ["m2", "m1"]);
});

test("optimistic extras merge into the stream in date order", () => {
  const draft = {
    id: "pending-1",
    at: "2026-08-15T12:00:00.000Z",
    event: ev("pending-1", "2026-08-15T12:00:00.000Z"),
  };
  const items = buildTimeline([ev("m1", "2026-08-12T09:00:00+00:00")], [draft]);
  assert.deepEqual(items.map((item) => item.id), ["pending-1", "m1"]);
});

test("only rows classified as user-written enter the timeline", () => {
  assert.equal(isManualEntry({ classified_by: "user" }), true);
  assert.equal(isManualEntry({ classified_by: "rule" }), false);
  assert.equal(isManualEntry({ classified_by: "model" }), false);
});

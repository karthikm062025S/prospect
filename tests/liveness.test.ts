import { test } from "node:test";
import assert from "node:assert/strict";
import { liveness } from "../lib/liveness.ts";

// Task 3 V3 (lane L2): the DONE-MEANS table verbatim. NOW is a fixed instant
// so "N days/hours ago" fixtures are deterministic; all reference instants
// are given as ISO strings the same way the DB would store them.
const NOW = new Date("2026-09-16T12:00:00Z").getTime(); // 08:00 ET

test("scanner seen 2 hours ago reads 'seen today'", () => {
  const result = liveness(
    { source: "scanner", last_seen_at: "2026-09-16T10:00:00Z", created_at: "2026-09-01T00:00:00Z" },
    NOW,
  );
  assert.equal(result.label, "seen today");
});

test("scanner seen 5 days ago reads 'last seen 5 days ago'", () => {
  const result = liveness(
    { source: "scanner", last_seen_at: "2026-09-11T12:00:00Z", created_at: "2026-09-01T00:00:00Z" },
    NOW,
  );
  assert.equal(result.label, "last seen 5 days ago");
});

test("feed:simplify seen 1 day ago reads 'last seen 1 day ago'", () => {
  const result = liveness(
    { source: "feed:simplify", last_seen_at: "2026-09-15T12:00:00Z", created_at: "2026-09-01T00:00:00Z" },
    NOW,
  );
  assert.equal(result.label, "last seen 1 day ago");
});

test("feed-target:simplify counts as re-confirming", () => {
  const result = liveness(
    { source: "feed-target:simplify", last_seen_at: "2026-09-16T10:00:00Z", created_at: "2026-09-01T00:00:00Z" },
    NOW,
  );
  assert.equal(result.label, "seen today");
});

test("linkedin is a single sighting: 'seen once <Mon D>'", () => {
  const result = liveness(
    { source: "linkedin", last_seen_at: "2026-09-03T14:00:00Z", created_at: "2026-09-03T14:00:00Z" },
    NOW,
  );
  assert.equal(result.label, "seen once Sep 3");
});

test("a null source is a single sighting", () => {
  const result = liveness(
    { source: null, last_seen_at: "2026-09-10T00:00:00Z", created_at: "2026-09-10T00:00:00Z" },
    NOW,
  );
  assert.equal(result.label, "seen once Sep 9"); // 2026-09-10T00:00:00Z is Sep 9 20:00 ET
});

test("other single-sighting sources (indeed, handshake, direct, mcp) all read 'seen once'", () => {
  for (const source of ["indeed", "handshake", "direct", "mcp"]) {
    const result = liveness(
      { source, last_seen_at: "2026-09-03T14:00:00Z", created_at: "2026-09-03T14:00:00Z" },
      NOW,
    );
    assert.equal(result.label, "seen once Sep 3", source);
  }
});

test("null last_seen_at falls back to updated_at", () => {
  const result = liveness(
    { source: "scanner", last_seen_at: null, updated_at: "2026-09-15T12:00:00Z", created_at: "2026-09-01T00:00:00Z" },
    NOW,
  );
  assert.equal(result.label, "last seen 1 day ago");
});

test("null last_seen_at and null updated_at fall back to created_at", () => {
  const result = liveness(
    { source: "scanner", last_seen_at: null, updated_at: null, created_at: "2026-09-11T12:00:00Z" },
    NOW,
  );
  assert.equal(result.label, "last seen 5 days ago");
});

test("undefined last_seen_at (pre-migration row, field absent) falls back the same way", () => {
  const result = liveness({ source: "scanner", created_at: "2026-09-16T10:00:00Z" }, NOW);
  assert.equal(result.label, "seen today");
});

test("repost_count 2 reads 'reposted 2x'", () => {
  const result = liveness(
    { source: "scanner", last_seen_at: "2026-09-16T10:00:00Z", created_at: "2026-09-01T00:00:00Z", repost_count: 2 },
    NOW,
  );
  assert.equal(result.repost, "reposted 2x");
});

test("repost_count 0 is null, not 'reposted 0x'", () => {
  const result = liveness(
    { source: "scanner", last_seen_at: "2026-09-16T10:00:00Z", created_at: "2026-09-01T00:00:00Z", repost_count: 0 },
    NOW,
  );
  assert.equal(result.repost, null);
});

test("repost_count null is null", () => {
  const result = liveness(
    { source: "scanner", last_seen_at: "2026-09-16T10:00:00Z", created_at: "2026-09-01T00:00:00Z", repost_count: null },
    NOW,
  );
  assert.equal(result.repost, null);
});

test("repost_count undefined (field absent) is null", () => {
  const result = liveness(
    { source: "scanner", last_seen_at: "2026-09-16T10:00:00Z", created_at: "2026-09-01T00:00:00Z" },
    NOW,
  );
  assert.equal(result.repost, null);
});

test("a future reference instant (clock skew) degrades to 'seen today', never negative", () => {
  const result = liveness(
    { source: "scanner", last_seen_at: "2026-09-20T00:00:00Z", created_at: "2026-09-01T00:00:00Z" },
    NOW,
  );
  assert.equal(result.label, "seen today");
});

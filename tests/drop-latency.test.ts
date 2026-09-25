import { test } from "node:test";
import assert from "node:assert/strict";
import { measureDropLatency } from "../scripts/drop-latency.mjs";

// Karthik 15:05 addendum (2026-09-19): "drops within 1 hour" must be MEASURED,
// not asserted. A fake pg client (duck-typed to the one method used,
// `.query()`) proves the percentile math without a real LAKEBASE_URL —
// the REAL boundary (the deployed Lakebase database) is Karthik's to run
// (`node scripts/drop-latency.mjs` against the deployed build, per the
// rule that this number is the only one allowed on stage).

function fakeClient(latencyMinutes: number[]) {
  return {
    query: async () => ({ rows: latencyMinutes.map((m) => ({ latency_min: String(m) })) }),
  };
}

test("measureDropLatency computes n/p50/p95/share-under-60 from query rows", async () => {
  // 10 rows: 9 fast (5min), 1 slow (200min) — p50 should land in the fast
  // cluster, p95 should catch the slow outlier, 90% under 60min.
  const latencies = [5, 5, 5, 5, 5, 5, 5, 5, 5, 200];
  const client = fakeClient(latencies);
  const result = await measureDropLatency({ client: client as never });
  assert.equal(result.n, 10);
  assert.equal(result.p50, 5);
  assert.equal(result.p95, 200);
  assert.equal(result.shareUnder60, 0.9);
});

test("measureDropLatency throws the named error on zero rows (never reports a fabricated 0)", async () => {
  const client = fakeClient([]);
  await assert.rejects(
    () => measureDropLatency({ client: client as never }),
    /no rows with source_posted_at in the last 24h/,
  );
});

test("measureDropLatency throws the named error when LAKEBASE_URL is unset and no client is injected", async () => {
  await assert.rejects(() => measureDropLatency({ connectionString: undefined }), /LAKEBASE_URL is not set/);
});

// Drop-latency measurement (Karthik 15:05 addendum, VTHacks 14, 2026-09-19).
//
// "Drops within 1 hour" is a stage claim and must be MEASURED, not asserted.
// Reads `roles` rows from the last 24h that carry `source_posted_at` (the
// board's own real publish timestamp — L0 is adding this column + parsing it
// from the watcher payload; scripts/scan-core.mjs's sources already emit it
// where the API gives a real timestamp, see buildCandidate/buildFeedRole/
// scripts/sources/*.mjs) and prints n, p50, p95 of (created_at -
// source_posted_at) in minutes, plus the share under 60 minutes.
//
// This number, measured on the deployed build, is the only latency figure
// allowed on stage.
//
// Standalone: `node scripts/drop-latency.mjs`. Uses `pg` directly (own
// connection, not lib/db.ts — that module is another lane's fence right now,
// and every scripts/*.mjs in this repo is import-standalone from lib/ by
// convention, same discipline as isTargetTitle/bucket's duplicated copies).
//
// Env: LAKEBASE_URL (required).

import pg from "pg";
import { pathToFileURL } from "node:url";

const { Client } = pg;

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, idx)];
}

export async function measureDropLatency({ connectionString = process.env.LAKEBASE_URL, client } = {}) {
  if (!connectionString && !client) {
    throw new Error("LAKEBASE_URL is not set");
  }
  const ownClient = !client;
  const c = client ?? new Client({ connectionString });
  if (ownClient) await c.connect();
  try {
    const { rows } = await c.query(
      `SELECT EXTRACT(EPOCH FROM (created_at - source_posted_at)) / 60.0 AS latency_min
       FROM roles
       WHERE source_posted_at IS NOT NULL
         AND created_at >= now() - interval '24 hours'`,
    );
    const latenciesMin = rows.map((r) => Number(r.latency_min)).filter((n) => Number.isFinite(n));
    if (latenciesMin.length === 0) {
      throw new Error("no rows with source_posted_at in the last 24h");
    }
    latenciesMin.sort((a, b) => a - b);
    const n = latenciesMin.length;
    const p50 = percentile(latenciesMin, 50);
    const p95 = percentile(latenciesMin, 95);
    const under60 = latenciesMin.filter((m) => m < 60).length;
    const shareUnder60 = under60 / n;
    return { n, p50, p95, shareUnder60 };
  } finally {
    if (ownClient) await c.end();
  }
}

async function main() {
  try {
    const { n, p50, p95, shareUnder60 } = await measureDropLatency();
    console.log(`drop-latency: n=${n} · p50=${p50.toFixed(1)}min · p95=${p95.toFixed(1)}min · under-60min=${(shareUnder60 * 100).toFixed(1)}%`);
  } catch (err) {
    console.error(`DROP_LATENCY FAILED: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

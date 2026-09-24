import { NextResponse, after } from "next/server";
import { query, type QueryFn } from "@/lib/db";
import { isCorrectPassword } from "@/lib/gate";
import { upsertRole } from "@/lib/upsert-role";
import { filterTier } from "@/lib/scan-tier";
import { makeConditionalFetch, type WatchState } from "@/lib/etag-fetch";
import { captureInsertedRoleJds } from "@/lib/role-jd";
import { scanEndpoints } from "@/scripts/scan-core.mjs";
import endpoints from "@/scripts/endpoints.json";
import targets from "@/scripts/targets.json";

// Fast discovery lane (RB-082 v2, slice 6c). .github/workflows/heartbeat.yml
// POSTs here every 3 hours (tier=hot) with the watcher secret; we answer 202 at once (the caller's
// timeout is short) and do the scan + upsert in after(). Same core as the Actions CLI
// (scripts/scan-core.mjs), same ingest path (lib/upsert-role.ts), so the two
// lanes dedup against each other server-side. Same args as scan.yml passes:
// --since-days 3 --concurrency 16.
//
// 6c-finish: the ETag branch (TRD §13 spike 5). `watch_state` rows feed
// lib/etag-fetch.ts, which wraps `fetch` through the core's existing `fetchFn`
// seam — a 304 skips the multi-MB download + parse that is the CPU. No drop
// notification (MISSION D7/D12): Prospect only alerts on failure.
//
// Segment config, not vercel.json: maxDuration is the native Next way to set
// the function timeout (Hobby cap 300 s); force-dynamic keeps the route off any
// static path.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SINCE_DAYS = 3;
const CONCURRENCY = 16;
async function loadWatchState(q: QueryFn): Promise<WatchState> {
  const state: WatchState = new Map();
  const rows = await q<{ endpoint_key: string; etag: string | null; last_modified: string | null }>(
    "select endpoint_key, etag, last_modified from watch_state order by endpoint_key",
    [],
    "watch_state",
  );
  for (const row of rows) state.set(row.endpoint_key, { etag: row.etag, last_modified: row.last_modified });
  return state;
}

async function saveWatchState(
  q: QueryFn,
  updates: Map<string, { etag: string | null; last_modified: string | null }>,
  checkedAt: string,
): Promise<number> {
  if (updates.size === 0) return 0;
  const rows = [...updates];
  await q(
    `insert into watch_state (endpoint_key, etag, last_modified, checked_at)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[])
     on conflict (endpoint_key) do update
       set etag = excluded.etag, last_modified = excluded.last_modified, checked_at = excluded.checked_at`,
    [rows.map(([key]) => key), rows.map(([, v]) => v.etag), rows.map(([, v]) => v.last_modified), rows.map(() => checkedAt)],
    "watch_state",
  );
  return rows.length;
}

export async function POST(request: Request) {
  const secret = request.headers.get("X-Watcher-Secret");
  const expected = process.env.WATCHER_SECRET;
  if (!secret || !expected || !isCorrectPassword(secret, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tier = new URL(request.url).searchParams.get("tier") ?? "full";
  if (tier !== "hot" && tier !== "full") {
    return NextResponse.json({ error: "tier must be hot or full" }, { status: 400 });
  }
  const filtered = filterTier(endpoints, targets, tier);

  after(async () => {
    const t0 = performance.now();
    const cpu0 = process.cpuUsage();
    // cpu_ms = user+system CPU for this run — the Active CPU number the cadence is locked from.
    const cpuMs = () => Math.round((process.cpuUsage(cpu0).user + process.cpuUsage(cpu0).system) / 1000);
    // Per-vendor endpoint counts: CPU is not separable per vendor inside one run, so the
    // re-measure compares runs on (vendors, etag_sent, etag_hits, cpu_ms) instead.
    const vendors: Record<string, number> = {};
    for (const ep of filtered) vendors[ep.ats] = (vendors[ep.ats] ?? 0) + 1;
    try {
      // A failed watch_state read fails the run, named, via the catch below
      // (the table is part of db/lakebase/001-schema.sql; there is no cold path).
      const state: WatchState = await loadWatchState(query);
      const conditional = makeConditionalFetch(fetch, state);

      // Addendum 2 (2026-09-19): `wide: true` applies the L2 lane's widened
      // eligibility (every major, every level) exactly like the CLI. The option
      // is read by scripts/scan-core.mjs on the l2-lane branch; on a base without
      // it the extra key is ignored (not a typed object literal, so no excess-
      // property error either way).
      const scanOptions = { sinceDays: SINCE_DAYS, concurrency: CONCURRENCY, fetch: conditional.fetch, wide: true };
      const { roles } = await scanEndpoints(filtered, scanOptions);
      // Phase line: if the 300 s cap kills the upsert loop, the scan half is still legible.
      console.log(
        JSON.stringify({
          lane: "fast",
          tier,
          phase: "scan-done",
          roles: roles.length,
          watch_state_loaded: state.size,
          etag_sent: conditional.sent,
          etag_hits: conditional.hits,
          vendors,
          ms: Math.round(performance.now() - t0),
          cpu_ms: cpuMs(),
        }),
      );

      let inserted = 0;
      let updated = 0;
      let skippedApplied = 0;
      let skippedTombstoned = 0;
      let skippedFiltered = 0;
      let errors = 0;
      const errorSamples: string[] = [];
      const insertedRoleIds: string[] = [];
      for (const entry of roles) {
        try {
          const { action, role } = await upsertRole(query, entry);
          if (action === "insert") {
            inserted += 1;
            if (role && typeof role === "object" && "id" in role) insertedRoleIds.push((role as { id: string }).id);
          } else if (action === "update") updated += 1;
          else if (action === "skip_tombstoned") skippedTombstoned += 1;
          else if (action === "skip_filtered") skippedFiltered += 1;
          else skippedApplied += 1;
        } catch (err) {
          errors += 1;
          if (errorSamples.length < 5) errorSamples.push(err instanceof Error ? err.message : String(err));
        }
      }

      // D24/item 2 (MISSION v5): JD capture for roles genuinely INSERTED this
      // run, bounded + inside the already-non-blocking after() this route runs in.
      if (insertedRoleIds.length > 0) {
        const { captured, failed } = await captureInsertedRoleJds(query, insertedRoleIds);
        console.log(JSON.stringify({ lane: "jd-ingest", inserted: insertedRoleIds.length, captured, failed }));
      }

      const watchStateSaved = await saveWatchState(query, conditional.updates, new Date().toISOString());

      // The one line the re-measure reads in Vercel runtime logs.
      console.log(
        JSON.stringify({
          lane: "fast",
          tier,
          endpoints: filtered.length,
          vendors,
          etag_sent: conditional.sent,
          etag_hits: conditional.hits,
          watch_state_loaded: state.size,
          watch_state_saved: watchStateSaved,
          roles: roles.length,
          inserted,
          updated,
          skipped_applied: skippedApplied,
          skipped_tombstoned: skippedTombstoned,
          skipped_filtered: skippedFiltered,
          errors,
          error_samples: errorSamples,
          ms: Math.round(performance.now() - t0),
          cpu_ms: cpuMs(),
        }),
      );
    } catch (err) {
      console.error(JSON.stringify({ lane: "fast", tier, error: err instanceof Error ? err.message : String(err) }));
    }
  });

  return NextResponse.json({ accepted: true, tier, endpoints: filtered.length }, { status: 202 });
}

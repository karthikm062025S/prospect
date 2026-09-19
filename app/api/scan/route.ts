import { NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { isCorrectPassword } from "@/lib/gate";
import { toInsertedRoleEcho, upsertRole } from "@/lib/upsert-role";
import { filterTier } from "@/lib/scan-tier";
import { makeConditionalFetch, type WatchState } from "@/lib/etag-fetch";
import { postDailyIssue, type NotifyRole } from "@/lib/scan-notify";
import { captureInsertedRoleJds } from "@/lib/role-jd";
import { scanEndpoints } from "@/scripts/scan-core.mjs";
import endpoints from "@/scripts/endpoints.json";
import targets from "@/scripts/targets.json";

// Fast discovery lane (RB-082 v2, slice 6c). pg_cron → pg_net POSTs here every
// few minutes with the watcher secret; we answer 202 at once (pg_net's timeout
// is short) and do the scan + upsert in after(). Same core as the Actions CLI
// (scripts/scan-core.mjs), same ingest path (lib/upsert-role.ts), so the two
// lanes dedup against each other server-side. Same args as scan.yml passes:
// --since-days 3 --concurrency 16.
//
// 6c-finish: the ETag branch (TRD §13 spike 5). `watch_state` rows feed
// lib/etag-fetch.ts, which wraps `fetch` through the core's existing `fetchFn`
// seam — a 304 skips the multi-MB download + parse that is the CPU. The table
// is loaded best-effort: missing table / any error → empty Map + a log line,
// never a failed scan (the cold path is the same scan as before). Inserted
// roles @mention the owner on the per-day GitHub issue scan.yml also uses
// (lib/scan-notify.ts); no `GITHUB_ISSUES_PAT` → notify skipped, logged.
//
// Segment config, not vercel.json: maxDuration is the native Next way to set
// the function timeout (Hobby cap 300 s); force-dynamic keeps the route off any
// static path.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SINCE_DAYS = 3;
const CONCURRENCY = 16;
const PAGE = 1000; // PostgREST max-rows; full tier has ~900 GET urls, so page

async function loadWatchState(supabase: SupabaseClient): Promise<WatchState> {
  const state: WatchState = new Map();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("watch_state")
      .select("endpoint_key,etag,last_modified")
      .order("endpoint_key")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) state.set(row.endpoint_key, { etag: row.etag, last_modified: row.last_modified });
    if (!data || data.length < PAGE) break;
  }
  return state;
}

async function saveWatchState(
  supabase: SupabaseClient,
  updates: Map<string, { etag: string | null; last_modified: string | null }>,
  checkedAt: string,
): Promise<number> {
  if (updates.size === 0) return 0;
  const rows = [...updates].map(([endpoint_key, v]) => ({ endpoint_key, ...v, checked_at: checkedAt }));
  const { error } = await supabase.from("watch_state").upsert(rows, { onConflict: "endpoint_key" });
  if (error) throw new Error(error.message);
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
      const supabase = createServiceClient();
      let state: WatchState = new Map();
      try {
        state = await loadWatchState(supabase);
      } catch (err) {
        // e.g. relation "watch_state" does not exist (migration not applied yet) → cold scan.
        console.log(JSON.stringify({ lane: "fast", tier, watch_state: "unavailable", error: err instanceof Error ? err.message : String(err) }));
      }
      const conditional = makeConditionalFetch(fetch, state);

      const { roles } = await scanEndpoints(filtered, { sinceDays: SINCE_DAYS, concurrency: CONCURRENCY, fetch: conditional.fetch });
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
      const insertedRoles: NotifyRole[] = [];
      const insertedRoleIds: string[] = [];
      for (const entry of roles) {
        try {
          const { action, role } = await upsertRole(supabase, entry);
          if (action === "insert") {
            inserted += 1;
            insertedRoles.push(toInsertedRoleEcho(entry));
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
        const { captured, failed } = await captureInsertedRoleJds(supabase, insertedRoleIds);
        console.log(JSON.stringify({ lane: "jd-ingest", inserted: insertedRoleIds.length, captured, failed }));
      }

      let watchStateSaved = 0;
      try {
        watchStateSaved = await saveWatchState(supabase, conditional.updates, new Date().toISOString());
      } catch (err) {
        console.log(JSON.stringify({ lane: "fast", tier, watch_state: "save-failed", error: err instanceof Error ? err.message : String(err) }));
      }

      const pat = process.env.GITHUB_ISSUES_PAT;
      // G1 L3: "owner/repo" comes from the environment, never from source.
      const issueRepo = process.env.SCOUT_ISSUE_REPO;
      if (insertedRoles.length === 0) {
        console.log(JSON.stringify({ lane: "fast", tier, notify: "skipped", reason: "no inserts" }));
      } else if (!pat) {
        console.log(JSON.stringify({ lane: "fast", tier, notify: "skipped", reason: "no PAT", inserted: insertedRoles.length }));
      } else if (!issueRepo) {
        console.log(JSON.stringify({ lane: "fast", tier, notify: "skipped", reason: "no SCOUT_ISSUE_REPO", inserted: insertedRoles.length }));
      } else {
        try {
          const out = await postDailyIssue({ fetch, token: pat, repo: issueRepo, inserted: insertedRoles });
          console.log(JSON.stringify({ lane: "fast", tier, notify: out.action, issue: out.number, inserted: insertedRoles.length }));
        } catch (err) {
          console.log(JSON.stringify({ lane: "fast", tier, notify: "failed", error: err instanceof Error ? err.message : String(err) }));
        }
      }

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

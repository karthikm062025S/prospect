// Deterministic ATS scanner (Scout v2.3 P0).
//
// Runs OUT of any LLM session — locally (`node scripts/scan.mjs`) or on the
// GitHub Actions cron (.github/workflows/scan.yml) — fetches every verified ATS
// endpoint, filters to fresh US SWE/AI/Data/Quant intern candidates
// deterministically, and POSTs survivors to the existing /api/watcher webhook
// (which dedups on company+title+posted_at and enforces the applied-lock).
//
// Recall-first: it posts a minimal payload with NO lifecycle (the app defaults
// new roles to "open"). Manual qualification in the APPLY tab decides real
// eligibility (US / Summer-2027 term / visa) per RULES.md afterwards — so the
// title role-gate here is deliberately broad, and only the checks a machine can
// make with certainty (obvious wrong term, clearly-foreign-only location) drop
// a candidate outright.
//
// Env: WATCHER_SECRET + SCOUT_WEBHOOK (both required to POST — SCOUT_WEBHOOK has
// NO default; this is a hackathon repo and must never silently fall back to the
// old Scout production URL, 2026-09-19 16:45 fix). Flags: --dry-run (no POST),
// --since-days N (recency window, default 3),
// --concurrency N (default 8), --strict (MISSION L2, 2026-09-19: opt back into
// the old CS-intern-only filter; the coverage-widened filter — every function,
// every level — is the DEFAULT now). --dry-run without --strict also prints a
// before/after comparison against the old filter (Done Means D).
//
// The fetch + filter body lives in scripts/scan-core.mjs (shared with the Vercel
// fast lane, app/api/scan/route.ts); this file is the CLI wrapper: flags, the
// health floor, the canary, the POST, and last-drops.json.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { scanEndpoints, epKey, deriveLevel } from "./scan-core.mjs";

// Re-exported so tests/scan-filter.test.ts keeps importing the pure filters
// from here, unchanged.
export { isTargetTitle, looksUS, bucket, buildCandidate } from "./scan-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- args / env ----
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  const v = i >= 0 ? args[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : def;
};
const DRY_RUN = flag("dry-run");
const STRICT = flag("strict");
const WIDE = !STRICT;
// Guard against a mistyped flag silently corrupting a scan (NaN window drops all
// dated jobs; 0 concurrency scans nothing) — fall back to the default.
const num = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};
const SINCE_DAYS = num(opt("since-days", "3"), 3);
const CONCURRENCY = num(opt("concurrency", "8"), 8);
// No default — a hackathon repo must never silently fall back to the old
// Scout production URL (2026-09-19 16:45 fix). Checked before any fetch, below.
const WEBHOOK = process.env.SCOUT_WEBHOOK || "";
const SECRET = process.env.WATCHER_SECRET || "";
// The canary's "0 raw postings ⇒ broken" invariant only holds for adapters that
// fetch the WHOLE board (a live board always has some postings). The others filter
// server-side (keyword/searchText=intern), so their count legitimately hits 0
// off-season and must NOT be canaried. See the canary loop.
const FULL_BOARD_ATS = new Set(["greenhouse", "ashby", "lever", "smartrecruiters"]);

function withinDaysAgo(iso, days) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return (Date.now() - t) / 86400000 <= days;
}

async function main() {
  // Checked before any fetch (2026-09-19 16:45 fix): SCOUT_WEBHOOK has no
  // default, so a live run with it unset must fail loud, not silently target
  // nothing / the wrong app.
  if (!DRY_RUN && !WEBHOOK) {
    console.error("SCOUT_WEBHOOK is not set");
    process.exit(1);
  }

  const endpoints = JSON.parse(await readFile(process.env.ENDPOINTS_FILE || join(__dirname, "endpoints.json"), "utf8"));
  console.log(
    `scan: ${endpoints.length} endpoints · since-days=${SINCE_DAYS} · concurrency=${CONCURRENCY} · ${WIDE ? "WIDE (all functions/levels)" : "STRICT (CS-intern-only)"} · ${DRY_RUN ? "DRY-RUN" : "LIVE"} → ${WEBHOOK}`,
  );

  // Done Means D (before/after coverage proof): a --dry-run also runs the OLD
  // strict filter over the SAME endpoints so the widening has a real number,
  // not an assertion. Skipped on a live run (would double the network cost).
  // The WIDE result below is reused as `uniq` (no third fetch of the same 999
  // endpoints).
  let uniq, okCount, failed, rawCounts;
  if (DRY_RUN && WIDE) {
    const before = await scanEndpoints(endpoints, { sinceDays: SINCE_DAYS, concurrency: CONCURRENCY, fetch, wide: false });
    const after = await scanEndpoints(endpoints, { sinceDays: SINCE_DAYS, concurrency: CONCURRENCY, fetch, wide: true });
    ({ roles: uniq, okCount, failed, rawCounts } = after);
    const beforeKeys = new Set(before.roles.map((r) => `${r.company}|${r.title}`));
    const newOnly = after.roles.filter((r) => !beforeKeys.has(`${r.company}|${r.title}`));
    console.log(
      `\n--- coverage before/after (same ${endpoints.length} endpoints, since-days=${SINCE_DAYS}) ---\n` +
        `BEFORE (strict, CS-intern-only): ${before.roles.length} kept\n` +
        `AFTER  (wide, every function/level): ${after.roles.length} kept\n` +
        `net new from widening: ${newOnly.length}`,
    );
    const nonSwe = newOnly.filter((r) => !["SWE", "AI", "Data", "Quant"].includes(r.role_type));
    const examples = nonSwe.length ? nonSwe.slice(0, 5) : newOnly.slice(0, 5);
    console.log(`\n5 example newly-kept postings (non-engineering functions preferred):`);
    for (const r of examples) {
      const board = r.link ? new URL(r.link).hostname : "no-link";
      console.log(`  · ${r.company} — ${r.title} [${r.role_type} / ${deriveLevel(r.title)}] (${board})`);
    }
  } else {
    ({ roles: uniq, okCount, failed, rawCounts } = await scanEndpoints(endpoints, {
      sinceDays: SINCE_DAYS,
      concurrency: CONCURRENCY,
      fetch,
      wide: WIDE,
    }));
  }

  // Health floor: a mass ATS/network outage is caught endpoint-by-endpoint, so the
  // scan would otherwise exit 0 with ~0 candidates — the >26h heartbeat would see a
  // "healthy" run and never alert (a silent blind spot, flagged by the dd668fb
  // review). Fail loudly when okCount collapses so the heartbeat fires. Generous
  // floor: only a systemic failure trips it, not routine transient misses of a few
  // endpoints. Runs before the canary so a mass-outage run doesn't churn baselines.
  if (!DRY_RUN && endpoints.length > 0 && okCount < endpoints.length * 0.5) {
    console.error(`\nHEALTH: only ${okCount}/${endpoints.length} endpoints responded (<50%) — failing so heartbeat alerts.`);
    process.exit(1);
  }

  // ---- baseline-relative canary (silent-failure detector) ----
  // A liveness check catches a 404 (→ `failed` above). It does NOT catch an
  // endpoint that still 200s but silently returns 0 postings (bad token reused,
  // schema drift, a renamed board) — which looks identical to "healthy, nothing
  // new" and would silently blind a whole company. So: a FULL_BOARD_ATS endpoint
  // that reliably returned postings before (baseline ≥ MIN) but returned 0 (or
  // errored) this run is flagged. Restricted to full-board adapters ON PURPOSE:
  // their jobs.length is the whole board (always nonzero on a live board), so 0
  // means broken — seasonality never trips it. The keyword-filtered adapters
  // (amazon/oracle/phenom/workday) return an intern-match count that legitimately
  // hits 0 off-season, so they cannot use a count-based canary and are excluded.
  // Persisted across runs via endpoint-baseline.json (GitHub Actions restores/
  // saves it through actions/cache; locally it's just a file).
  const CANARY_MIN_BASELINE = 3; // only watch endpoints that reliably had ≥3 postings
  const CANARY_MISS_STREAK = 2; // fire only after this many CONSECUTIVE zero runs
  let baseline = {};
  try {
    baseline = JSON.parse(await readFile(join(__dirname, "endpoint-baseline.json"), "utf8"));
  } catch {
    baseline = {}; // first run — no baseline yet, nothing can regress
  }
  const regressions = [];
  const canarySeen = new Set();
  for (const ep of endpoints) {
    if (!FULL_BOARD_ATS.has(ep.ats)) continue; // count-based canary is invalid for keyword-filtered adapters
    const k = epKey(ep);
    if (canarySeen.has(k)) continue; // advance state once per unique key, not per duplicate entry
    canarySeen.add(k);
    const raw = rawCounts[k] ?? 0; // 0 when the endpoint errored/was empty this run
    // state per key: { good: last nonzero raw count, miss: consecutive zero-runs }.
    let b = baseline[k];
    if (typeof b === "number") b = { good: b, miss: 0 }; // migrate old numeric format
    if (!b) b = { good: 0, miss: 0 };
    if (raw > 0) { b.good = raw; b.miss = 0; }
    else b.miss = (b.miss || 0) + 1;
    // Fire only after CANARY_MISS_STREAK consecutive zero-runs so a transient
    // single-run blip (Workday 500s under load, a timeout) never cries wolf; a
    // real silent break (bad token / schema drift) persists and fires. Baseline
    // is RAW board size, so off-season low intern counts never trip it.
    if (b.good >= CANARY_MIN_BASELINE && raw === 0 && b.miss >= CANARY_MISS_STREAK) {
      regressions.push({ company: ep.company, ats: ep.ats, key: k, baseline: b.good, misses: b.miss });
    }
    baseline[k] = b;
  }
  await writeFile(join(__dirname, "endpoint-baseline.json"), JSON.stringify(baseline, null, 2));
  if (regressions.length) {
    console.log(`\n⚠ canary: ${regressions.length} endpoint(s) silently returning 0 for ≥${CANARY_MISS_STREAK} runs (baseline ≥${CANARY_MIN_BASELINE}):`);
    for (const r of regressions) console.log(`  · ${r.company} [${r.ats}] was ${r.baseline} → 0 (${r.misses} misses)`);
  }


  console.log(`\nendpoints ok ${okCount}/${endpoints.length} · candidates ${uniq.length}`);
  if (failed.length) console.log(`failed (${failed.length}): ${failed.join(", ")}`);
  for (const c of uniq) console.log(`  · ${c.company} — ${c.title} [${c.role_type}] ${c.posted_at ?? "no-date"}`);

  // Fail fast on a misconfigured live run — even with zero candidates, a missing
  // secret means the cron is broken and must not exit 0 (masking as healthy).
  if (!DRY_RUN && !SECRET) {
    await writeFile(join(__dirname, "last-drops.json"), JSON.stringify([], null, 2));
    console.error("\nWATCHER_SECRET not set — cannot POST. Set it or use --dry-run.");
    process.exit(1);
  }
  if (uniq.length === 0) {
    await writeFile(join(__dirname, "last-drops.json"), JSON.stringify([], null, 2));
    console.log("nothing to post.");
    return;
  }
  if (DRY_RUN) {
    await writeFile(join(__dirname, "last-drops.json"), JSON.stringify([], null, 2));
    console.log("\n--dry-run: not posting.");
    return;
  }

  // Wide mode posts thousands of roles; one POST would outlive the webhook's
  // function timeout (the 2026-09-19 Actions run aborted at 30 s). Post in
  // batches, each with its own timeout, and aggregate the webhook's counts.
  const BATCH = 150;
  const r = { inserted: 0, updated: 0, skipped_applied: 0, skipped_tombstoned: 0, skipped_filtered: 0, errors: [], inserted_roles: [] };
  for (let i = 0; i < uniq.length; i += BATCH) {
    const batch = uniq.slice(i, i + BATCH);
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Watcher-Secret": SECRET },
      body: JSON.stringify({ roles: batch }),
      signal: AbortSignal.timeout(55000),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      console.error(`\nPOST failed HTTP ${res.status} on batch ${i / BATCH + 1} (${batch.length} roles): ${bodyText}`);
      process.exit(1);
    }
    const part = JSON.parse(bodyText).roles || {};
    for (const k of ["inserted", "updated", "skipped_applied", "skipped_tombstoned", "skipped_filtered"]) r[k] += part[k] || 0;
    r.errors.push(...(part.errors || []));
    if (Array.isArray(part.inserted_roles)) r.inserted_roles.push(...part.inserted_roles);
    console.log(`POST batch ${i / BATCH + 1}/${Math.ceil(uniq.length / BATCH)} ok: +${part.inserted || 0} inserted`);
  }
  const out = { roles: r };
  console.log(`\nPOST ok: inserted ${r.inserted} · updated ${r.updated} · skipped_applied ${r.skipped_applied} · errors ${r.errors.length}`);
  if (r.errors.length) console.log(r.errors.join("\n"));
  // MISSION D10: /api/watcher answers 200 even when every row fails (run
  // 36020225011: inserted 0, updated 0, errors 450), so fail the run instead of
  // reporting a false green. Any insert/update/skip means the DB answered.
  // exitCode, not exit(), so the duration line prints.
  const handled = r.inserted + r.updated + r.skipped_applied + r.skipped_tombstoned + r.skipped_filtered;
  if (r.errors.length > 0 && handled === 0) {
    console.error("every posted row errored server-side: failing the run");
    process.exitCode = 1;
  }

  // Notify layer: source last-drops.json from the webhook's true "genuinely new"
  // set (inserted_roles) so an `updated` re-find never re-notifies and a
  // newly-inserted UNDATED role is no longer silently dropped. Falls back to the
  // old pre-POST recency proxy (dated ≤1d) when the webhook hasn't shipped
  // inserted_roles yet, so nothing breaks before that deploy.
  const insertedRoles = Array.isArray(out.roles?.inserted_roles) ? out.roles.inserted_roles : null;
  const notify = insertedRoles
    ? insertedRoles.map((ir) => ({
        company: ir.company,
        title: ir.title,
        role_type: ir.role_type,
        posted_at: ir.posted_at,
        link: ir.link,
      }))
    : uniq.filter((c) => withinDaysAgo(c.posted_at, 1));
  await writeFile(join(__dirname, "last-drops.json"), JSON.stringify(notify, null, 2));
  console.log(`notify: wrote ${notify.length} role(s) to last-drops.json (${insertedRoles ? "inserted_roles" : "fallback proxy"})`);
}

// Run only when invoked as a script (`node scripts/scan.mjs`), NOT when imported
// by a test — tests import the pure filters (isTargetTitle/looksUS/bucket).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runStarted = Date.now();
  main()
    .catch((err) => {
      console.error("scan failed:", err);
      process.exitCode = 1;
    })
    .finally(() => {
      // How long one full run takes, so the scan.yml cadence (every 3 hours,
      // MISSION D7) stays a measured decision.
      console.log(`\nrun duration: ${((Date.now() - runStarted) / 1000).toFixed(1)}s`);
    });
}

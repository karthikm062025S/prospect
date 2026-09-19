// Workday tenant source (MISSION L2, VTHacks 14, 2026-09-19).
//
// Public Workday CXS API, no key required. Fetches every VERIFIED tenant in
// workday-tenants.json (each one live-fetched, 200 + jobPostings, during this
// build — see the handoff's VERIFIED SOURCES TABLE) and returns rows in the
// EXISTING watcher payload shape (lib/watcher-payload.ts / lib/upsert-role.ts's
// UpsertRoleInput — read, not modified, by this lane).
//
// Standalone + runnable: `node scripts/sources/workday.mjs --limit 5` prints
// the rows as JSON, or the named SOURCE FAILED line, and exits 1 on failure.
// `fetchRows({ limit })` is the importable entry point scripts/scan-sources.mjs
// wires into the combined POST.
//
// Env: none required (Workday's public CXS jobs endpoint needs no key).

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { isEligiblePosting, looksUS, bucketWide } from "../scan-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FETCH_TIMEOUT_MS = 20000;
const PAGE_SIZE = 20;
const MAX_PAGES_PER_TENANT = 3; // ponytail: enough to prove coverage per run without a slow full crawl

const WD_RELATIVE = /today|yesterday|\d+\s*\+?\s*days?\s*ago/i;
function wdIsRealDate(postedOn) {
  if (!postedOn || WD_RELATIVE.test(String(postedOn))) return false;
  return !Number.isNaN(Date.parse(String(postedOn)));
}
async function fetchTenantPage(tenant, page, fetchFn) {
  const url = `https://${tenant.host}/wday/cxs/${tenant.tenant}/${tenant.site}/jobs`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchFn(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset: page * PAGE_SIZE, searchText: "" }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function toRow(tenant, job) {
  const realDate = wdIsRealDate(job.postedOn);
  const link = job.externalPath ? `https://${tenant.host}/en-US/${tenant.site}${job.externalPath}` : null;
  const posted_at = realDate ? new Date(Date.parse(job.postedOn)).toISOString().slice(0, 10) : null;
  return {
    company: tenant.company,
    title: String(job.title || "").trim(),
    role_type: bucketWide(job.title || ""),
    posted_at,
    link,
    source: `workday-tenant:${tenant.tenant}`,
    location: job.locationsText || null,
    ...(realDate ? { source_posted_at: new Date(Date.parse(job.postedOn)).toISOString() } : {}),
  };
}

// fetchRows({ limit, fetch }) -> row[] in the existing watcher payload shape.
// Spreads across every verified tenant (so a single run proves coverage across
// >=4 tenants, per Done Means B) rather than draining `limit` from tenant #1.
export async function fetchRows({ limit = 20, fetch: fetchFn = globalThis.fetch } = {}) {
  const tenantsRaw = await readFile(join(__dirname, "workday-tenants.json"), "utf8");
  const tenants = JSON.parse(tenantsRaw);
  if (!Array.isArray(tenants) || tenants.length === 0) {
    throw new Error("workday-tenants.json has no verified tenants");
  }
  const rows = [];
  const perTenant = Math.max(1, Math.ceil(limit / tenants.length));
  for (const tenant of tenants) {
    if (rows.length >= limit) break;
    let gotForTenant = 0;
    for (let page = 0; page < MAX_PAGES_PER_TENANT && gotForTenant < perTenant && rows.length < limit; page++) {
      let data;
      try {
        data = await fetchTenantPage(tenant, page, fetchFn);
      } catch (err) {
        console.error(`  workday tenant ${tenant.company} (${tenant.tenant}/${tenant.site}) fetch failed: ${err.message}`);
        break; // this tenant is down this run — other tenants still contribute
      }
      const posts = data.jobPostings || [];
      if (posts.length === 0) break;
      for (const job of posts) {
        if (rows.length >= limit || gotForTenant >= perTenant) break;
        if (!job.title || !isEligiblePosting(job.title)) continue;
        if (!looksUS(job.locationsText, null)) continue;
        rows.push(toRow(tenant, job));
        gotForTenant++;
      }
      if (posts.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// CLI: node scripts/sources/workday.mjs --limit 5
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--limit");
  const limit = i >= 0 && args[i + 1] ? Number(args[i + 1]) : 20;
  try {
    const rows = await fetchRows({ limit });
    console.log(JSON.stringify(rows, null, 2));
    console.log(`\nSOURCE ok workday: ${rows.length} rows`);
  } catch (err) {
    console.error(`SOURCE FAILED workday: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

// Adzuna source (MISSION L2, VTHacks 14, 2026-09-19) — aggregates postings
// across many small/regional employers the 999 verified ATS boards miss.
//
// Docs (Context7 had no Adzuna entry; used the official docs per the build
// brief): https://developer.adzuna.com/docs/search
// GET https://api.adzuna.com/v1/api/jobs/us/search/1?app_id&app_key&what&
// results_per_page&content-type=application/json. Response array at
// `results[]`; fields: title, company.display_name, location.display_name,
// redirect_url, created (ISO 8601). Live-verified 2026-09-19 (no key in this
// environment yet): the endpoint returns HTTP 400 with no app_id/app_key —
// confirms the host/path are reachable, not dead; a real 200 + parsed rows
// needs ADZUNA_APP_ID + ADZUNA_APP_KEY (Karthik to provision).
//
// Standalone + runnable: `node scripts/sources/adzuna.mjs --limit 5`.
// Env: ADZUNA_APP_ID (required), ADZUNA_APP_KEY (required).

import { pathToFileURL } from "node:url";
import { bucketWide, isEligiblePosting, looksUS } from "../scan-core.mjs";

const FETCH_TIMEOUT_MS = 20000;

function toRow(job) {
  const title = String(job.title || "").trim();
  const created = job.created || null;
  return {
    company: job.company?.display_name || "Unknown",
    title,
    role_type: bucketWide(title),
    posted_at: created ? created.slice(0, 10) : null,
    link: job.redirect_url || null,
    source: "adzuna",
    location: job.location?.display_name || null,
    ...(created && !Number.isNaN(Date.parse(created)) ? { source_posted_at: new Date(Date.parse(created)).toISOString() } : {}),
  };
}

// fetchRows({ limit, fetch }) -> row[] in the existing watcher payload shape.
export async function fetchRows({ limit = 20, fetch: fetchFn = globalThis.fetch } = {}) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId) throw new Error("ADZUNA_APP_ID is not set");
  if (!appKey) throw new Error("ADZUNA_APP_KEY is not set");

  const perPage = Math.min(limit, 50);
  const url =
    `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
    `&results_per_page=${perPage}&content-type=application/json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let data;
  try {
    const res = await fetchFn(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (!Array.isArray(data.results)) throw new Error("adzuna: missing results[] (schema drift?)");
  const rows = [];
  for (const job of data.results) {
    if (rows.length >= limit) break;
    const row = toRow(job);
    if (!row.title || !isEligiblePosting(row.title)) continue;
    if (!looksUS(row.location, null)) continue;
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// CLI: node scripts/sources/adzuna.mjs --limit 5
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--limit");
  const limit = i >= 0 && args[i + 1] ? Number(args[i + 1]) : 20;
  try {
    const rows = await fetchRows({ limit });
    console.log(JSON.stringify(rows, null, 2));
    console.log(`\nSOURCE ok adzuna: ${rows.length} rows`);
  } catch (err) {
    console.error(`SOURCE FAILED adzuna: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

// USAJOBS source (MISSION L2, VTHacks 14, 2026-09-19) — federal government
// roles (a whole function/sector the old CS-intern-only scan never touched).
//
// Docs (Context7 had no USAJOBS entry; used the official docs per the
// build brief): https://developer.usajobs.gov/api-reference/get-api-search
// GET https://data.usajobs.gov/api/search, headers `Host: data.usajobs.gov`,
// `Authorization-Key: <key>`, `User-Agent: <contact email>`. Response array at
// SearchResult.SearchResultItems[]; fields under .MatchedObjectDescriptor
// (PositionTitle, OrganizationName, PositionLocationDisplay, PositionURI,
// PublicationStartDate, PositionStartDate). Live-verified 2026-09-19 (no key
// in this environment yet): the endpoint returns a clean 401 Unauthorized —
// confirms the host/path are correct and the API is auth-gated, not dead; a
// real 200 + parsed rows needs USAJOBS_API_KEY (Karthik to provision).
//
// Standalone + runnable: `node scripts/sources/usajobs.mjs --limit 5`.
// Env: USAJOBS_API_KEY (required), USAJOBS_USER_AGENT (required — USAJOBS
// requires a real contact email as the User-Agent, not a browser string).

import { pathToFileURL } from "node:url";
import { bucketWide, isEligiblePosting } from "../scan-core.mjs";

const FETCH_TIMEOUT_MS = 20000;

function toRow(item) {
  const d = item.MatchedObjectDescriptor || {};
  const title = String(d.PositionTitle || "").trim();
  const sourcePostedAt = d.PublicationStartDate || d.PositionStartDate || null;
  return {
    company: d.OrganizationName || "U.S. Government",
    title,
    role_type: bucketWide(title),
    posted_at: sourcePostedAt ? sourcePostedAt.slice(0, 10) : null,
    link: d.PositionURI || (Array.isArray(d.ApplyURI) ? d.ApplyURI[0] : null) || null,
    source: "usajobs",
    location: d.PositionLocationDisplay || null,
    ...(sourcePostedAt && !Number.isNaN(Date.parse(sourcePostedAt))
      ? { source_posted_at: new Date(Date.parse(sourcePostedAt)).toISOString() }
      : {}),
  };
}

// fetchRows({ limit, fetch }) -> row[] in the existing watcher payload shape.
export async function fetchRows({ limit = 20, fetch: fetchFn = globalThis.fetch } = {}) {
  const key = process.env.USAJOBS_API_KEY;
  const userAgent = process.env.USAJOBS_USER_AGENT;
  if (!key) throw new Error("USAJOBS_API_KEY is not set");
  if (!userAgent) throw new Error("USAJOBS_USER_AGENT is not set");

  const url = `https://data.usajobs.gov/api/search?ResultsPerPage=${Math.min(limit, 500)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let data;
  try {
    const res = await fetchFn(url, {
      signal: ctrl.signal,
      headers: {
        Host: "data.usajobs.gov",
        "Authorization-Key": key,
        "User-Agent": userAgent,
        accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const items = data?.SearchResult?.SearchResultItems;
  if (!Array.isArray(items)) throw new Error("usajobs: missing SearchResult.SearchResultItems (schema drift?)");
  const rows = [];
  for (const item of items) {
    if (rows.length >= limit) break;
    const row = toRow(item);
    if (!row.title || !isEligiblePosting(row.title)) continue;
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// CLI: node scripts/sources/usajobs.mjs --limit 5
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--limit");
  const limit = i >= 0 && args[i + 1] ? Number(args[i + 1]) : 20;
  try {
    const rows = await fetchRows({ limit });
    console.log(JSON.stringify(rows, null, 2));
    console.log(`\nSOURCE ok usajobs: ${rows.length} rows`);
  } catch (err) {
    console.error(`SOURCE FAILED usajobs: ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

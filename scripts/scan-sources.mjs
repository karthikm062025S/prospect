// New-source runner (MISSION L2, VTHacks 14, 2026-09-19): runs the three new
// sources (Workday tenants, USAJOBS, Adzuna) and POSTs their combined rows to
// the SAME /api/watcher webhook as scripts/scan.mjs, one named summary line
// per source. A separate file (not folded into scan.mjs) because these are a
// different concern — named external sources with their own keys/failure
// modes — from the 999-endpoint ATS scan.
//
// Rule 2 (loud + named failures): each source's success/failure prints
// `SOURCE ok <name>: N rows` / `SOURCE FAILED <name>: <reason>`; the run still
// POSTs whatever the other sources found, then exits non-zero if any source
// failed.
//
// Env: WATCHER_SECRET (required to POST), SCOUT_WEBHOOK (optional, defaults
// prod), USAJOBS_API_KEY + USAJOBS_USER_AGENT, ADZUNA_APP_ID + ADZUNA_APP_KEY
// (workday needs no key). Flags: --dry-run, --limit N (per-source cap,
// default 100).

import { writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fetchRows as fetchWorkdayRows } from "./sources/workday.mjs";
import { fetchRows as fetchUsajobsRows } from "./sources/usajobs.mjs";
import { fetchRows as fetchAdzunaRows } from "./sources/adzuna.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  const v = i >= 0 ? args[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : def;
};
const DRY_RUN = flag("dry-run");
const LIMIT = Number(opt("limit", "100")) || 100;
const WEBHOOK = process.env.SCOUT_WEBHOOK || "https://intern-hq-inky.vercel.app/api/watcher";
const SECRET = process.env.WATCHER_SECRET || "";

const SOURCES = [
  { name: "workday", fetchRows: fetchWorkdayRows },
  { name: "usajobs", fetchRows: fetchUsajobsRows },
  { name: "adzuna", fetchRows: fetchAdzunaRows },
];

async function main() {
  const allRows = [];
  let anyFailed = false;
  for (const src of SOURCES) {
    try {
      const rows = await src.fetchRows({ limit: LIMIT });
      console.log(`SOURCE ok ${src.name}: ${rows.length} rows`);
      allRows.push(...rows);
    } catch (err) {
      anyFailed = true;
      console.error(`SOURCE FAILED ${src.name}: ${err.message}`);
    }
  }

  console.log(`\ncombined rows: ${allRows.length}`);
  await writeFile(join(__dirname, "last-sources.json"), JSON.stringify(allRows, null, 2));

  if (DRY_RUN) {
    console.log("--dry-run: not posting.");
  } else if (allRows.length > 0) {
    if (!SECRET) {
      console.error("WATCHER_SECRET not set — cannot POST. Set it or use --dry-run.");
      process.exitCode = 1;
      return;
    }
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Watcher-Secret": SECRET },
      body: JSON.stringify({ roles: allRows }),
      signal: AbortSignal.timeout(30000),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      console.error(`POST failed HTTP ${res.status}: ${bodyText}`);
      process.exitCode = 1;
      return;
    }
    const out = JSON.parse(bodyText);
    const r = out.roles || {};
    console.log(`POST ok: inserted ${r.inserted} · updated ${r.updated} · skipped_applied ${r.skipped_applied} · errors ${(r.errors || []).length}`);
  } else {
    console.log("nothing to post.");
  }

  // Rule 2: post what succeeded, but the run itself is non-zero when any
  // source failed — a missing key or a schema surprise never looks healthy.
  if (anyFailed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("scan-sources failed:", err);
    process.exit(1);
  });
}

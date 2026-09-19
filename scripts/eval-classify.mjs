// Task 2 D9: the three gate numbers and the agreement score.
//
//   --counts             open roles / open with season unspecified / open with
//                        season unspecified AND a stored JD (service-role read,
//                        same env names as scripts/sample-rows.mjs). Usable alone.
//   --labels + --url     read the hand-labelled CSV, ask the deployed route for a
//                        dry-run proposal on exactly those ids (never writes),
//                        score primary family and season against Karthik's labels.
//
//   node --env-file=.env.local scripts/eval-classify.mjs --counts
//   node --env-file=.env.local scripts/eval-classify.mjs --counts --labels planning/task-2-labels.csv --url https://scoutfeed.vercel.app/api/classify
//
// Verdict (D9 + D9a): PASS = family agree >= 36/40 AND season agree >= 36/40
// AND open "unspecified with a JD" <= 444 (D9a, re-pinned 2026-09-15 from a stale
// 186; live baseline 2,200 / 1,420 / 889). Agreement below 30/40 on either is
// FAIL, otherwise GRAY. For another N the same fractions apply (0.9 and 0.75,
// rounded up). Without --counts the count condition is reported as not checked.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    counts: { type: "boolean", default: false },
    labels: { type: "string" },
    url: { type: "string" },
  },
});
const scoring = Boolean(args.labels || args.url);
if (!args.counts && !scoring) {
  console.error("nothing to do: pass --counts, or --labels <csv> --url <deployed /api/classify>, or both");
  process.exit(1);
}
if (scoring && !(args.labels && args.url)) {
  console.error("--labels and --url go together");
  process.exit(1);
}

const COUNT_BAR = 444; // D9a

// ---- counts block ----
let unspecifiedWithJd = null;
if (args.counts) {
  if (!process.env.LAKEBASE_URL) {
    console.error("DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set (--counts needs it; run with --env-file=.env.local)");
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.LAKEBASE_URL, max: 1 });
  const count = async (label, where) => {
    try {
      const { rows } = await pool.query(`select count(*)::int as n from roles where lifecycle = 'open' ${where}`);
      return rows[0].n;
    } catch (err) {
      console.error(`${label} count failed: ${err.message}`);
      process.exit(1);
    }
  };
  const open = await count("open", "");
  const unspecified = await count("unspecified", "and season = 'unspecified'");
  unspecifiedWithJd = await count("unspecified with jd", "and season = 'unspecified' and jd_snapshot is not null");
  await pool.end();
  console.log(`open roles ${open}`);
  console.log(`open roles with season unspecified ${unspecified}`);
  console.log(`open roles with season unspecified and a stored jd ${unspecifiedWithJd} (bar <= ${COUNT_BAR})`);
  if (!scoring) {
    console.log(`D9a count condition: ${unspecifiedWithJd <= COUNT_BAR ? "met" : "not met"} (${unspecifiedWithJd} <= ${COUNT_BAR}); no D9 verdict, agreement not checked (no --labels/--url)`);
    process.exit(0);
  }
}

// ---- agreement block ----
const secret = process.env.WATCHER_SECRET;
if (!secret) {
  console.error("WATCHER_SECRET is required (run with --env-file=.env.local)");
  process.exit(1);
}

// Minimal RFC 4180 reader: quoted fields, doubled quotes, comment lines skipped.
function parseCsv(text) {
  const records = [];
  let field = "";
  let record = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      field = "";
      record = [];
    } else field += ch;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => r.length > 1 || (r[0] ?? "") !== "").filter((r) => !r[0].startsWith("#"));
}

const [header, ...body] = parseCsv(readFileSync(args.labels, "utf8"));
const col = (name) => {
  const i = header.indexOf(name);
  if (i === -1) {
    console.error(`column ${name} missing from ${args.labels}`);
    process.exit(1);
  }
  return i;
};
const idCol = col("id");
const familyCol = col("karthik_family");
const seasonCol = col("karthik_season");
const labels = body.map((r) => ({ id: r[idCol], family: r[familyCol].trim(), season: r[seasonCol].trim() }));
const unlabelled = labels.filter((l) => !l.family || !l.season);
if (unlabelled.length > 0) {
  console.error(`${unlabelled.length} row(s) still unlabelled: ${unlabelled.map((l) => l.id).join(", ")}`);
  process.exit(1);
}

const ids = labels.map((l) => l.id).slice(0, 50);
const res = await fetch(`${args.url}?dry_run=1&limit=50&ids=${ids.join(",")}`, {
  method: "POST",
  headers: { "X-Watcher-Secret": secret },
});
if (!res.ok) {
  console.error(`route http ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const result = await res.json();
const byId = new Map(result.rows.map((r) => [r.id, r]));

let familyAgree = 0;
let seasonAgree = 0;
const misses = [];
for (const l of labels) {
  const r = byId.get(l.id);
  if (!r) {
    misses.push(`${l.id}: not returned by the route (no JD, or unknown id)`);
    continue;
  }
  const f = r.after.family === l.family;
  const s = r.after.season === l.season;
  if (f) familyAgree += 1;
  if (s) seasonAgree += 1;
  if (!f || !s) misses.push(`${l.id} ${r.title}: family ${r.after.family} vs ${l.family}, season ${r.after.season} vs ${l.season} (${r.by})`);
}

const N = labels.length;
const passBar = Math.ceil(N * 0.9);
const grayBar = Math.ceil(N * 0.75);
const agreementOk = familyAgree >= passBar && seasonAgree >= passBar;
const agreementFail = familyAgree < grayBar || seasonAgree < grayBar;
// The count condition is part of PASS only; without --counts it is "not checked" and PASS is withheld.
const countOk = unspecifiedWithJd !== null && unspecifiedWithJd <= COUNT_BAR;
const verdict = agreementFail ? "FAIL" : agreementOk && countOk ? "PASS" : "GRAY";
const countText =
  unspecifiedWithJd === null ? "count not checked (run with --counts)" : `unspecified with jd ${unspecifiedWithJd} <= ${COUNT_BAR} ${countOk ? "ok" : "NOT met"}`;

for (const m of misses) console.log(`miss: ${m}`);
console.log(`family agree ${familyAgree}/${N} (pass >= ${passBar}, gray >= ${grayBar}, fail below)`);
console.log(`season agree ${seasonAgree}/${N} (pass >= ${passBar}, gray >= ${grayBar}, fail below)`);
console.log(`llm called ${result.llm_called}, written ${result.llm_written}, low confidence ${result.llm_low_confidence}`);
console.log(`D9 verdict: ${verdict}; family ${familyAgree}/${N}, season ${seasonAgree}/${N}, ${countText}`);

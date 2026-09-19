// Task 2 D9: draw the hand-label sample. Uniformly random n open roles that
// have a stored JD, written as a CSV Karthik fills in by hand. No
// classification here on purpose: the pipeline's answer comes from the route
// (scripts/eval-classify.mjs), never from a copy of the rules.
//
//   node --env-file=.env.local scripts/sample-rows.mjs --n 40 --out planning/task-2-labels.csv
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import pg from "pg";

const { values: args } = parseArgs({
  options: { n: { type: "string", default: "40" }, out: { type: "string", default: "planning/task-2-labels.csv" } },
});
const n = Number.parseInt(args.n, 10);
if (!Number.isFinite(n) || n < 1) {
  console.error("--n must be a positive integer");
  process.exit(1);
}
if (!process.env.LAKEBASE_URL) {
  console.error("DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set (run with --env-file=.env.local)");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.LAKEBASE_URL, max: 1 });
const { rows } = await pool.query(
  "select id, title, link, company_id from roles where lifecycle = 'open' and jd_snapshot is not null order by id",
);

// Fisher-Yates, then take the head: every row equally likely.
for (let i = rows.length - 1; i > 0; i -= 1) {
  const j = Math.floor(Math.random() * (i + 1));
  [rows[i], rows[j]] = [rows[j], rows[i]];
}
const sample = rows.slice(0, n);

const companyIds = [...new Set(sample.map((r) => r.company_id))];
const { rows: companies } = await pool.query("select id, name from companies where id = any($1::uuid[])", [companyIds]);
await pool.end();
const companyName = new Map(companies.map((c) => [c.id, c.name]));

// Titles and links come from employers: a cell starting with = + - @ would run
// as a formula when the CSV is opened in a spreadsheet, so it gets a leading
// apostrophe (the spreadsheet convention for "this is text").
const csv = (value) => {
  const raw = value == null ? "" : String(value);
  const s = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const lines = [
  "# karthik_family: swe | ai_ml | data | quant | product | security | hardware | design | other; karthik_season: summer_2027 | fall_2027 | spring_2028 | summer_2028 | coop | unspecified",
  "id,company,title,link,karthik_family,karthik_season",
  ...sample.map((r) => [r.id, companyName.get(r.company_id) ?? "", r.title, r.link, "", ""].map(csv).join(",")),
];
writeFileSync(args.out, lines.join("\n") + "\n");
console.log(`wrote ${sample.length} of ${rows.length} open roles with a JD to ${args.out}`);

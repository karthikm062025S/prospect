// Task 2 D9: draw the hand-label sample. Uniformly random n open roles that
// have a stored JD, written as a CSV Karthik fills in by hand. No
// classification here on purpose: the pipeline's answer comes from the route
// (scripts/eval-classify.mjs), never from a copy of the rules.
//
//   node --env-file=.env.local scripts/sample-rows.mjs --n 40 --out planning/task-2-labels.csv
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: args } = parseArgs({
  options: { n: { type: "string", default: "40" }, out: { type: "string", default: "planning/task-2-labels.csv" } },
});
const n = Number.parseInt(args.n, 10);
if (!Number.isFinite(n) || n < 1) {
  console.error("--n must be a positive integer");
  process.exit(1);
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local)");
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PAGE = 1000;
const rows = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase
    .from("roles")
    .select("id,title,link,company_id")
    .eq("lifecycle", "open")
    .not("jd_snapshot", "is", null)
    .order("id")
    .range(from, from + PAGE - 1);
  if (error) {
    console.error(`roles read failed: ${error.message}`);
    process.exit(1);
  }
  rows.push(...(data ?? []));
  if (!data || data.length < PAGE) break;
}

// Fisher-Yates, then take the head: every row equally likely.
for (let i = rows.length - 1; i > 0; i -= 1) {
  const j = Math.floor(Math.random() * (i + 1));
  [rows[i], rows[j]] = [rows[j], rows[i]];
}
const sample = rows.slice(0, n);

const companyIds = [...new Set(sample.map((r) => r.company_id))];
const { data: companies, error: companyError } = await supabase.from("companies").select("id,name").in("id", companyIds);
if (companyError) {
  console.error(`companies read failed: ${companyError.message}`);
  process.exit(1);
}
const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]));

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

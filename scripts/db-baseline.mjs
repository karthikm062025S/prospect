// One-off pre-migration baseline dump (D11: replaces the pg_dump "full dump"
// the plan asked for — no pg_dump/psql/supabase CLI on this machine, so we
// page through every row via the JS client instead). Reads .env.local by
// hand (no dotenv dependency), pages each table 1000 rows at a time, and
// writes db/baseline-2026-09/<table>.json + counts.json. A table that
// doesn't exist (e.g. not created yet) logs a warning and is recorded null.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const text = readFileSync(path.join(rootDir, ".env.local"), "utf8");
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    env[key] = value;
  }
  return env;
}

const env = loadEnvLocal();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TABLES = [
  "companies",
  "roles",
  "applications",
  "outreach",
  "tombstones",
  "drops",
  "tasks",
  "prep_items",
];

const PAGE_SIZE = 1000;

async function dumpTable(table) {
  let rows = [];
  let from = 0;
  let total = null;
  for (;;) {
    const { data, error, count } = await supabase
      .from(table)
      .select("*", { count: "exact" })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.warn(`[db-baseline] WARN: table "${table}" unreadable (${error.message}); recording null`);
      return null;
    }
    if (total === null) total = count ?? 0;
    rows = rows.concat(data ?? []);
    if (!data || data.length < PAGE_SIZE || rows.length >= total) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function main() {
  const outDir = path.join(rootDir, "db", "baseline-2026-09");
  mkdirSync(outDir, { recursive: true });

  const counts = {};
  for (const table of TABLES) {
    const rows = await dumpTable(table);
    if (rows === null) {
      counts[table] = null;
      continue;
    }
    writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2) + "\n");
    counts[table] = rows.length;
    console.log(`${table}: ${rows.length}`);
  }

  const countsOut = { ...counts, dumped_at: new Date().toISOString() };
  writeFileSync(path.join(outDir, "counts.json"), JSON.stringify(countsOut, null, 2) + "\n");
  console.log("counts.json written:", JSON.stringify(countsOut));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

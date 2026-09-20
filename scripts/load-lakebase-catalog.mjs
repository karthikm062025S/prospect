#!/usr/bin/env node
// Loads datasets/{vt_courses,vt_clubs,task_exposure}.csv into the Lakebase
// tables created by db/lakebase/007-catalog.sql (D-S4). Idempotent: every row
// is UPSERTed by its primary key in batches of 500, so re-running never
// duplicates and never needs a truncate. Columns are mapped BY NAME from each
// file's header; a missing required column fails by name before any write.
// Same CSV rules as scripts/load-datasets.mjs (lib/csv.ts, header row 1).
//
//   node --env-file=.env.local scripts/load-lakebase-catalog.mjs [--dir <datasets dir>] [--only vt_courses,vt_clubs,task_exposure]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { parseCsv } from "../lib/csv.ts";

const BATCH = 500;

// type: "text" | "numeric" | "int". Every listed column is required in the
// header (task_exposure.csv carries onet_soc_code + source too; they are
// simply not mapped). `optional` columns may be empty in a row (-> NULL).
export const TABLES = {
  vt_courses: {
    file: "vt_courses.csv",
    key: "code",
    columns: [
      { name: "code", type: "text" },
      { name: "title", type: "text" },
      { name: "description", type: "text" },
      { name: "credits", type: "numeric", optional: true },
      { name: "department", type: "text", optional: true },
      { name: "level", type: "int", optional: true },
      { name: "prereqs", type: "text", optional: true },
    ],
  },
  vt_clubs: {
    file: "vt_clubs.csv",
    key: "name",
    columns: [
      { name: "name", type: "text" },
      { name: "description", type: "text" },
      { name: "category", type: "text", optional: true },
      { name: "url", type: "text", optional: true },
    ],
  },
  task_exposure: {
    file: "task_exposure.csv",
    key: "task_id",
    columns: [
      { name: "task_id", type: "text" },
      { name: "automation_share", type: "numeric" },
      { name: "augmentation_share", type: "numeric" },
    ],
  },
};

/** null when every mapped column is in the header; else a message naming the first missing one. */
export function missingColumn(table, header) {
  const present = new Set(header);
  const missing = table.columns.map((c) => c.name).find((c) => !present.has(c));
  return missing ? `REFUSED ${table.file}: expected column "${missing}" not found (header: ${header.join(", ")})` : null;
}

function coerce(value, column, rowNo) {
  const raw = value === undefined ? "" : value.trim();
  if (raw === "") {
    if (column.optional) return null;
    throw new Error(`row ${rowNo} column "${column.name}" is empty`);
  }
  if (column.type === "text") return raw;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`row ${rowNo} column "${column.name}" is not a number: "${raw}"`);
  return column.type === "int" ? Math.trunc(n) : n;
}

/** Rows keyed by name, last duplicate key wins (an upsert statement cannot touch the same key twice). */
export function toRecords(table, header, rows) {
  const index = new Map(header.map((name, i) => [name, i]));
  const byKey = new Map();
  rows.forEach((row, i) => {
    const record = {};
    for (const column of table.columns) record[column.name] = coerce(row[index.get(column.name)], column, i + 2);
    byKey.set(record[table.key], record);
  });
  return { records: [...byKey.values()], duplicates: rows.length - byKey.size };
}

export function upsertSql(name, table, count) {
  const cols = table.columns.map((c) => c.name);
  const width = cols.length;
  const tuples = Array.from({ length: count }, (_, r) => `(${cols.map((_, c) => `$${r * width + c + 1}`).join(", ")})`);
  const updates = cols.filter((c) => c !== table.key).map((c) => `${c} = excluded.${c}`);
  return `insert into ${name} (${cols.join(", ")}) values ${tuples.join(", ")} on conflict (${table.key}) do update set ${updates.join(", ")}`;
}

function parseArgs(argv) {
  const args = { dir: path.resolve(import.meta.dirname, "..", "..", "datasets"), only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") args.dir = argv[++i];
    else if (argv[i] === "--only") args.only = argv[++i].split(",").map((s) => s.trim());
  }
  return args;
}

async function main() {
  const url = process.env.LAKEBASE_URL;
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set");
  const { dir, only } = parseArgs(process.argv.slice(2));

  // Parse and validate every file BEFORE opening a connection: a bad file fails the whole run with nothing written.
  const loads = [];
  for (const name of only ?? Object.keys(TABLES)) {
    const table = TABLES[name];
    if (!table) throw new Error(`UNKNOWN dataset: ${name}`);
    const filePath = path.join(dir, table.file);
    if (!existsSync(filePath)) throw new Error(`MISSING ${table.file}: expected ${filePath}`);
    const { header, rows } = parseCsv(readFileSync(filePath, "utf-8"));
    const headerError = missingColumn(table, header);
    if (headerError) throw new Error(headerError);
    const { records, duplicates } = toRecords(table, header, rows);
    console.log(`OK ${table.file}: ${records.length} rows${duplicates > 0 ? ` (${duplicates} duplicate ${table.key} rows collapsed, last wins)` : ""}`);
    loads.push({ name, table, records });
  }

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
  await client.connect();
  try {
    for (const { name, table, records } of loads) {
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const params = batch.flatMap((r) => table.columns.map((c) => r[c.name]));
        await client.query(upsertSql(name, table, batch.length), params);
      }
      const { rows } = await client.query(`select count(*)::int as n from ${name}`);
      console.log(`LOADED ${name}: upserted ${records.length}, table now holds ${rows[0].n} rows`);
    }
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

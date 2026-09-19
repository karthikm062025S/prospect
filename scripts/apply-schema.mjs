// Apply every db/lakebase/*.sql file, in name order, to LAKEBASE_URL. Each file is
// idempotent (create ... if not exists), so re-running is safe. No psql needed.
//   node --env-file=.env.local scripts/apply-schema.mjs
// Fails loud: missing LAKEBASE_URL, a file that errors (named, with the pg message).
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

const url = process.env.LAKEBASE_URL;
if (!url) {
  console.error("DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set");
  process.exit(1);
}
const dir = resolve(import.meta.dirname, "..", "db", "lakebase");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (files.length === 0) {
  console.error(`no .sql files under ${dir}`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
await client.connect();
try {
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    try {
      await client.query(sql);
      console.log(`APPLIED ${f}`);
    } catch (error) {
      console.error(`SCHEMA_APPLY_FAILED ${f}: ${error.message}`);
      process.exit(1);
    }
  }
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
  );
  console.log(`tables (${rows.length}): ${rows.map((r) => r.table_name).join(", ")}`);
} finally {
  await client.end();
}

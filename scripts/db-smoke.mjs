// L0 smoke against the REAL Lakebase: applies db/lakebase/001-schema.sql
// (idempotent), prints the table list and a row count per table.
//
//   node --env-file=.env.local scripts/db-smoke.mjs
//
// Exit 0 = schema applied and every count read. Exit 1 = LAKEBASE_URL unset
// (named) or any statement failed (named). Never prints the URL.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const url = process.env.LAKEBASE_URL;
if (!url) {
  console.error("DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(path.join(root, "db", "lakebase", "001-schema.sql"), "utf8");

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await pool.query(schema);
  console.log("schema applied: db/lakebase/001-schema.sql");
  const { rows: tables } = await pool.query(
    "select table_name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE' order by table_name",
  );
  for (const { table_name } of tables) {
    const { rows } = await pool.query(`select count(*)::int as n from ${table_name}`);
    console.log(`${table_name.padEnd(20)} ${rows[0].n}`);
  }
  const { rows: views } = await pool.query(
    "select table_name from information_schema.views where table_schema = current_schema() order by table_name",
  );
  console.log(`views: ${views.map((v) => v.table_name).join(", ")}`);
} catch (err) {
  console.error(`DB_SMOKE_FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

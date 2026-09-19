// L0 seed: the REAL 2026-09-04 export (db/baseline-2026-09/*.json, gitignored —
// copy it in from the main checkout) into Lakebase. Idempotent: every insert is
// `on conflict (id) do nothing`, so a second run inserts 0.
//
//   node --env-file=.env.local scripts/import-baseline.mjs
//
// Tables in FK order: companies -> roles -> tombstones -> applications -> outreach,
// all in ONE transaction (roles.application_id -> applications is deferrable, so
// the circular roles<->applications pair resolves at commit). A rejected row
// rolls the whole import back and exits 1 naming the table and the row id.
//
// Last step, derived from real rows (never invented): a user_roles link for
// every application that carries a role_id, so a seeded user's applied roles
// stay marked applied (the v7 migration's own backfill, re-run here).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TABLES = ["companies", "roles", "tombstones", "applications", "outreach"];
const BATCH = 100;

export function baselineDir() {
  return path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "db", "baseline-2026-09");
}

function readTable(dir, table) {
  const rows = JSON.parse(readFileSync(path.join(dir, `${table}.json`), "utf8"));
  if (!Array.isArray(rows)) throw new Error(`${table}.json is not an array`);
  return rows;
}

async function insertBatch(q, table, columns, rows) {
  const marks = rows
    .map((_, r) => `(${columns.map((_, c) => `$${r * columns.length + c + 1}`).join(", ")})`)
    .join(", ");
  const params = rows.flatMap((row) => columns.map((column) => row[column] ?? null));
  const inserted = await q(
    `insert into ${table} (${columns.join(", ")}) values ${marks} on conflict (id) do nothing returning id`,
    params,
    table,
  );
  return inserted.length;
}

/** Import every table through `q` (pg or pglite). Returns { table: { inserted, skipped, total } }. */
export async function importBaseline(q, dir = baselineDir(), log = () => {}) {
  const report = {};
  await q("begin");
  try {
    for (const table of TABLES) {
      const rows = readTable(dir, table);
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      let inserted = 0;
      for (let at = 0; at < rows.length; at += BATCH) {
        const batch = rows.slice(at, at + BATCH);
        await q(`savepoint b`);
        try {
          inserted += await insertBatch(q, table, columns, batch);
          await q(`release savepoint b`);
        } catch {
          // Find the offending row so the failure names it, then abort everything.
          await q(`rollback to savepoint b`);
          for (const row of batch) {
            await q(`savepoint r`);
            try {
              await insertBatch(q, table, columns, [row]);
              await q(`release savepoint r`);
            } catch (err) {
              throw new Error(`${table} row ${row.id} rejected: ${err.message}`);
            }
          }
        }
      }
      report[table] = { inserted, skipped: rows.length - inserted, total: rows.length };
      log(`${table.padEnd(13)} inserted ${String(inserted).padStart(5)} / skipped(existing) ${String(rows.length - inserted).padStart(5)} / total-in-file ${rows.length}`);
    }
    const linked = await q(
      `insert into user_roles (user_id, role_id, application_id)
       select user_id, role_id, id from applications where role_id is not null
       on conflict (user_id, role_id) do nothing returning role_id`,
      [],
      "user_roles",
    );
    report.user_roles = { inserted: linked.length, derived_from: "applications.role_id" };
    log(`user_roles    inserted ${String(linked.length).padStart(5)} (derived from applications.role_id)`);
    await q("commit");
  } catch (err) {
    await q("rollback");
    throw err;
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env.LAKEBASE_URL;
  if (!url) {
    console.error("DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set");
    process.exit(1);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const q = async (text, params = []) => (await client.query(text, params)).rows;
  try {
    await importBaseline(q, baselineDir(), console.log);
  } catch (err) {
    console.error(`IMPORT_FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

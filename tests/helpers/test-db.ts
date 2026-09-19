import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite, types } from "@electric-sql/pglite";
import type { QueryFn } from "../../lib/db.ts";

// D10 (build/MISSION.md): tests run the REAL Lakebase schema in an in-process
// Postgres (pglite), never a fake client. `q` has the exact shape of lib/db.ts
// `query`, including the same date/timestamp string parsers, so a lib function
// sees identical rows in a test and in production.
const SCHEMA = readFileSync(join(resolve(import.meta.dirname, "..", ".."), "db", "lakebase", "001-schema.sql"), "utf8");

export type TestDb = { q: QueryFn; close: () => Promise<void> };

export async function makeTestDb(): Promise<TestDb> {
  const db = new PGlite({
    parsers: {
      [types.DATE]: (value) => value,
      [types.TIMESTAMPTZ]: (value) => new Date(value).toISOString(),
    },
  });
  await db.exec(SCHEMA);
  const q: QueryFn = async (text, params = [], table) => {
    try {
      const result = await db.query(text, params as unknown[]);
      return result.rows as never;
    } catch (error) {
      const where = table ? ` (${table})` : "";
      throw new Error(`DB_QUERY_FAILED${where}: ${(error as Error).message}`, { cause: error });
    }
  };
  return { q, close: () => db.close() };
}

/** Insert one row by column name and return it. Test seeding only. */
export async function insertRow<T extends Record<string, unknown>>(q: QueryFn, table: string, row: Record<string, unknown>): Promise<T> {
  const keys = Object.keys(row);
  const cols = keys.join(", ");
  const marks = keys.map((_, i) => `$${i + 1}`).join(", ");
  const [inserted] = await q<T>(`insert into ${table} (${cols}) values (${marks}) returning *`, keys.map((k) => row[k]), table);
  return inserted;
}

/** Empty every table (one pglite per test file; each test starts clean). */
export async function truncateAll(q: QueryFn): Promise<void> {
  await q(
    "truncate companies, roles, applications, user_roles, application_events, outreach, feedback, watch_state, tombstones, role_corrections cascade",
  );
}

/** Deterministic test uuids: uuid(1) -> 00000000-0000-4000-8000-000000000001. */
export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

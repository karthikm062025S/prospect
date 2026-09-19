import { Pool, type QueryResultRow } from "pg";

// Server-only. The one Postgres pool for every app table (Databricks Lakebase).
// Supabase is auth only; nothing in this file knows about it.
if (typeof window !== "undefined") {
  throw new Error("lib/db.ts must never reach the client bundle");
}

let pool: Pool | undefined;

export function db(): Pool {
  const url = process.env.LAKEBASE_URL;
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set");
  // ponytail: one process-wide pool, max 5 (Lakebase scale-to-zero; serverless functions are short-lived).
  pool ??= new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
  return pool;
}

/** Run one parameterized statement; returns rows. Failures rethrow with the table named. Never swallows. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
  table?: string,
): Promise<T[]> {
  const pool = db(); // config errors surface unwrapped
  try {
    const result = await pool.query<T>(text, params as unknown[]);
    return result.rows;
  } catch (error) {
    const where = table ? ` (${table})` : "";
    throw new Error(`DB_QUERY_FAILED${where}: ${(error as Error).message}`, { cause: error });
  }
}

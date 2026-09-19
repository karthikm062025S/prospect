import { Pool, types, type QueryResultRow } from "pg";

// Server-only. The one Postgres pool for every app table (Databricks Lakebase).
// Supabase is auth only; nothing in this file knows about it.
if (typeof window !== "undefined") {
  throw new Error("lib/db.ts must never reach the client bundle");
}

// Rows keep the JSON shapes the app was written against (PostgREST returned
// every date/timestamp as a string): `date` stays "YYYY-MM-DD" (pg's default
// would be a JS Date at LOCAL midnight, the classic off-by-one), and
// timestamptz becomes an ISO string. The pglite test helper installs the same
// parsers so a test and production see identical rows.
const parseTimestamptz = types.getTypeParser(types.builtins.TIMESTAMPTZ);
types.setTypeParser(types.builtins.DATE, (value) => value);
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value) => (parseTimestamptz(value) as Date).toISOString());

/** The one query shape every query module takes as its first argument: production passes `query`
 *  (or a transaction's bound `q`), tests pass a pglite-backed one (tests/helpers/test-db.ts). */
export type QueryFn = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
  table?: string,
) => Promise<T[]>;

let pool: Pool | undefined;

export function db(): Pool {
  const url = process.env.LAKEBASE_URL;
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set");
  // ponytail: one process-wide pool, max 5 (Lakebase scale-to-zero; serverless functions are short-lived).
  pool ??= new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
  return pool;
}

function named(error: unknown, table?: string): Error {
  const where = table ? ` (${table})` : "";
  return new Error(`DB_QUERY_FAILED${where}: ${(error as Error).message}`, { cause: error });
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
    throw named(error, table);
  }
}

/** BEGIN / fn / COMMIT on one checked-out client; any throw rolls back and rethrows. */
export async function withTransaction<T>(fn: (q: QueryFn) => Promise<T>): Promise<T> {
  const client = await db().connect();
  const q: QueryFn = async (text, params = [], table) => {
    try {
      const result = await client.query(text, params as unknown[]);
      return result.rows;
    } catch (error) {
      throw named(error, table);
    }
  };
  try {
    await client.query("begin");
    const out = await fn(q);
    await client.query("commit");
    return out;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

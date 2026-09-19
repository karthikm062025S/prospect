// Server-only. Runs SQL against Delta tables (Unity Catalog `scout.core`) through
// the Databricks SQL warehouse via the SQL Statement Execution API.
//
// Request/response shape confirmed 2026-09-19 via Context7 (Databricks docs,
// /websites/databricks_aws_en) against these pages:
//   - https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial
//     (POST /api/2.0/sql/statements body: warehouse_id, statement, wait_timeout;
//      GET /api/2.0/sql/statements/{statement_id} to poll; response shape
//      { statement_id, status: { state }, manifest: { schema: { columns } },
//        result: { data_array } })
//   - https://docs.databricks.com/aws/en/sql/user/queries/query-tags
//     (confirms warehouse_id + statement as the POST body fields)
//   - https://docs.databricks.com/aws/en/ingestion/zerobus-errors
//     (Databricks REST error body shape: { error_code, message })
// status.state PENDING/RUNNING means keep polling; SUCCEEDED returns data;
// FAILED/CANCELED carry the error under status.error.message (documented
// Statement Execution API state machine; the tutorial page only showed the
// PENDING/SUCCEEDED examples, so the FAILED shape here follows the same
// { error_code, message } error convention Databricks uses elsewhere in the
// REST API).

if (typeof window !== "undefined") {
  throw new Error("lib/databricks-sql.ts must never reach the client bundle");
}

export interface StatementResult {
  rows: unknown[][];
  columns: string[];
}

const POLL_INTERVAL_MS = 1000;
// ponytail: 5 min ceiling so a stuck warehouse fails loud instead of hanging forever.
const MAX_WAIT_MS = 5 * 60 * 1000;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function warehouseIdFromPath(warehousePath: string): string {
  const tail = warehousePath.split("/").filter(Boolean).pop();
  if (!tail) throw new Error(`DATABRICKS_WAREHOUSE_PATH is malformed: ${warehousePath}`);
  return tail;
}

async function callApi(
  host: string,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${host}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof body.message === "string" ? body.message : JSON.stringify(body);
    throw new Error(`DATABRICKS_API_ERROR: ${res.status} ${message}`);
  }
  return body;
}

/** Runs one SQL statement to completion against the SQL warehouse. Throws named errors; never swallows. */
export async function executeStatement(sql: string): Promise<StatementResult> {
  const host = requiredEnv("DATABRICKS_HOST").replace(/\/$/, "");
  const token = requiredEnv("DATABRICKS_TOKEN");
  const warehousePath = requiredEnv("DATABRICKS_WAREHOUSE_PATH");
  const warehouse_id = warehouseIdFromPath(warehousePath);

  let body = await callApi(host, token, "/api/2.0/sql/statements", {
    method: "POST",
    body: JSON.stringify({ warehouse_id, statement: sql, wait_timeout: "30s" }),
  });

  const startedAt = Date.now();
  let status = body.status as { state?: string; error?: { message?: string } } | undefined;
  while (status?.state === "PENDING" || status?.state === "RUNNING") {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(
        `DATABRICKS_STATEMENT_TIMEOUT: statement ${body.statement_id} did not finish within ${MAX_WAIT_MS}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    body = await callApi(host, token, `/api/2.0/sql/statements/${body.statement_id}`);
    status = body.status as { state?: string; error?: { message?: string } } | undefined;
  }

  if (status?.state === "FAILED" || status?.state === "CANCELED") {
    const message = status.error?.message ?? `statement ended in state ${status.state}`;
    throw new Error(`DATABRICKS_STATEMENT_FAILED: ${message}`);
  }
  if (status?.state !== "SUCCEEDED") {
    throw new Error(`DATABRICKS_STATEMENT_FAILED: unexpected state ${status?.state}`);
  }

  const manifest = body.manifest as { schema?: { columns?: Array<{ name: string }> } } | undefined;
  const result = body.result as { data_array?: unknown[][] } | undefined;
  return {
    columns: manifest?.schema?.columns?.map((c) => c.name) ?? [],
    rows: result?.data_array ?? [],
  };
}

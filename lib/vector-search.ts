// Server-only. Talks to the ONE Databricks Vector Search endpoint (Free
// Edition caps the account at exactly one endpoint, one search unit --
// RUNBOOK-databricks.md §4 / §8) over its REST API via `fetch`. No SDK: the
// brief forbids new dependencies in this worktree.
//
// Request/response shapes confirmed 2026-09-19 via Context7 (Databricks API
// docs, /websites/databricks_api) against these pages:
//   - https://docs.databricks.com/api/vector-search/v1/create-vector-index.md
//     (POST /api/2.0/vector-search/indexes body: name, endpoint_name,
//      primary_key, index_type: "DELTA_SYNC", delta_sync_index_spec:
//      { source_table, embedding_source_columns: [{ name, embedding_model_endpoint_name }],
//      pipeline_type: "TRIGGERED" })
//   - https://docs.databricks.com/api/vector-search/v1/get-vector-index.md
//     (GET /api/2.0/vector-search/indexes/{name} -> { status: { ready, message,
//      indexed_row_count, index_url } })
//   - https://docs.databricks.com/api/vector-search/v1/sync-vector-index.md
//     (POST /api/2.0/vector-search/indexes/{name}/sync -> {} on success)
//   - https://docs.databricks.com/api/vector-search/v1/query-vector-index.md
//     (POST /api/2.0/vector-search/indexes/{name}/query body: query_text,
//      columns, num_results -> { manifest: { columns }, result: { data_array } })
//   - https://docs.databricks.com/aws/en/notebooks/source/generative-ai/vector-search-external-embedding-model-example.html
//     and https://docs.databricks.com/aws/en/ai-search/vector-search-python-sdk-example
//     (confirm the similarity score is appended as the LAST element of each
//      result row, after the requested `columns`, not itself a named column)

if (typeof window !== "undefined") {
  throw new Error("lib/vector-search.ts must never reach the client bundle");
}

/** The only hosted embedding model Free Edition allows (RUNBOOK-databricks.md §4/§8). */
export const EMBEDDING_MODEL = "databricks-gte-large-en";

export type IndexStatus = {
  ready: boolean;
  message?: string;
  indexed_row_count?: number;
  index_url?: string;
};

export type CreateDeltaSyncIndexInput = {
  name: string;
  sourceTable: string;
  primaryKey: string;
  textColumn: string;
};

export type QueryIndexInput = {
  name: string;
  text: string;
  columns: string[];
  numResults?: number;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function call(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const host = requiredEnv("DATABRICKS_HOST").replace(/\/$/, "");
  const token = requiredEnv("DATABRICKS_TOKEN");
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
    throw new Error(`VECTOR_SEARCH_API_ERROR: ${res.status} ${message}`);
  }
  return body;
}

/** Creates a Delta-sync index on the one `scout-vs` endpoint. Throws named errors; never swallows. */
export async function createDeltaSyncIndex(input: CreateDeltaSyncIndexInput): Promise<Record<string, unknown>> {
  const endpointName = requiredEnv("DATABRICKS_VS_ENDPOINT");
  return call("/api/2.0/vector-search/indexes", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      endpoint_name: endpointName,
      primary_key: input.primaryKey,
      index_type: "DELTA_SYNC",
      delta_sync_index_spec: {
        source_table: input.sourceTable,
        embedding_source_columns: [{ name: input.textColumn, embedding_model_endpoint_name: EMBEDDING_MODEL }],
        pipeline_type: "TRIGGERED",
      },
    }),
  });
}

/** GET the index's current status. Throws `VECTOR_SEARCH_API_ERROR: 404 ...` when the index does not exist yet. */
export async function indexStatus(name: string): Promise<IndexStatus> {
  const body = await call(`/api/2.0/vector-search/indexes/${encodeURIComponent(name)}`);
  return (body.status as IndexStatus) ?? { ready: false };
}

/** Triggers a TRIGGERED-pipeline sync so newly written source rows are searchable. */
export async function syncIndex(name: string): Promise<void> {
  await call(`/api/2.0/vector-search/indexes/${encodeURIComponent(name)}/sync`, { method: "POST" });
}

/**
 * Nearest-neighbor text query. Returns one object per row keyed by the
 * requested columns, plus a numeric `score` when the API returned one extra
 * trailing value beyond the requested columns (see the two cited SDK-example
 * docs above for the "score is the last element" convention).
 */
export async function queryIndex(input: QueryIndexInput): Promise<Array<Record<string, unknown>>> {
  const body = await call(`/api/2.0/vector-search/indexes/${encodeURIComponent(input.name)}/query`, {
    method: "POST",
    body: JSON.stringify({
      query_text: input.text,
      columns: input.columns,
      num_results: input.numResults ?? 5,
    }),
  });
  const result = body.result as { data_array?: unknown[][] } | undefined;
  const rows = result?.data_array ?? [];
  return rows.map((row) => {
    const record: Record<string, unknown> = {};
    input.columns.forEach((column, i) => {
      record[column] = row[i];
    });
    if (row.length > input.columns.length) {
      record.score = row[row.length - 1];
    }
    return record;
  });
}

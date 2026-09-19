import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeltaSyncIndex, indexStatus, syncIndex, queryIndex } from "../lib/vector-search.ts";

// Same missing-env pattern as tests/databricks-sql.test.ts: each check throws
// before `fetch` is ever called, so these pass regardless of connectivity.
const ENV_KEYS = ["DATABRICKS_HOST", "DATABRICKS_TOKEN", "DATABRICKS_VS_ENDPOINT"] as const;

function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], undefined>>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  return (async () => {
    try {
      for (const key of ENV_KEYS) {
        if (key in overrides) delete process.env[key];
        else process.env[key] ??= "placeholder";
      }
      await fn();
    } finally {
      for (const key of ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  })();
}

test("createDeltaSyncIndex throws DATABRICKS_HOST is not set when unset", async () => {
  await withEnv({ DATABRICKS_HOST: undefined }, async () => {
    await assert.rejects(
      createDeltaSyncIndex({ name: "x", sourceTable: "y", primaryKey: "id", textColumn: "d" }),
      /^Error: DATABRICKS_HOST is not set$/,
    );
  });
});

test("createDeltaSyncIndex throws DATABRICKS_TOKEN is not set when unset", async () => {
  await withEnv({ DATABRICKS_TOKEN: undefined }, async () => {
    await assert.rejects(
      createDeltaSyncIndex({ name: "x", sourceTable: "y", primaryKey: "id", textColumn: "d" }),
      /^Error: DATABRICKS_TOKEN is not set$/,
    );
  });
});

test("createDeltaSyncIndex throws DATABRICKS_VS_ENDPOINT is not set when unset", async () => {
  await withEnv({ DATABRICKS_VS_ENDPOINT: undefined }, async () => {
    await assert.rejects(
      createDeltaSyncIndex({ name: "x", sourceTable: "y", primaryKey: "id", textColumn: "d" }),
      /^Error: DATABRICKS_VS_ENDPOINT is not set$/,
    );
  });
});

test("indexStatus and syncIndex never require DATABRICKS_VS_ENDPOINT, only host and token", async () => {
  await withEnv({ DATABRICKS_VS_ENDPOINT: undefined, DATABRICKS_HOST: undefined }, async () => {
    await assert.rejects(indexStatus("x"), /^Error: DATABRICKS_HOST is not set$/);
    await assert.rejects(syncIndex("x"), /^Error: DATABRICKS_HOST is not set$/);
  });
});

test("queryIndex throws DATABRICKS_HOST is not set when unset", async () => {
  await withEnv({ DATABRICKS_HOST: undefined }, async () => {
    await assert.rejects(queryIndex({ name: "x", text: "y", columns: ["a"] }), /^Error: DATABRICKS_HOST is not set$/);
  });
});

test("queryIndex throws VECTOR_SEARCH_API_ERROR naming the status and message on a non-2xx response", async () => {
  await withEnv({}, async () => {
    const originalFetch = globalThis.fetch;
    // A fake fetch is a test double for the HTTP transport, not for job-posting
    // data -- it never stands in for a trust boundary this lane owns.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "index not found" }), { status: 404 })) as typeof fetch;
    try {
      await assert.rejects(
        queryIndex({ name: "scout.core.onet_tasks_index", text: "hello", columns: ["task_id"] }),
        /^Error: VECTOR_SEARCH_API_ERROR: 404 index not found$/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("queryIndex maps requested columns and appends a trailing score", async () => {
  await withEnv({}, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          manifest: { columns: [{ name: "task_id" }, { name: "onet_soc_code" }] },
          result: { data_array: [["15-1252.00-T1", "15-1252.00", 0.87]] },
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const rows = await queryIndex({
        name: "scout.core.onet_tasks_index",
        text: "write unit tests",
        columns: ["task_id", "onet_soc_code"],
        numResults: 1,
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].task_id, "15-1252.00-T1");
      assert.equal(rows[0].onet_soc_code, "15-1252.00");
      assert.equal(rows[0].score, 0.87);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

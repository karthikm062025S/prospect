import { test } from "node:test";
import assert from "node:assert/strict";
import { executeStatement } from "../lib/databricks-sql.ts";

// These tests never let a request reach the network: each missing-env check
// throws before `fetch` is ever called, so pass regardless of connectivity.
const ENV_KEYS = ["DATABRICKS_HOST", "DATABRICKS_TOKEN", "DATABRICKS_WAREHOUSE_PATH"] as const;

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

test("executeStatement throws DATABRICKS_HOST is not set when unset", async () => {
  await withEnv({ DATABRICKS_HOST: undefined }, async () => {
    await assert.rejects(executeStatement("select 1"), /^Error: DATABRICKS_HOST is not set$/);
  });
});

test("executeStatement throws DATABRICKS_TOKEN is not set when unset", async () => {
  await withEnv({ DATABRICKS_TOKEN: undefined }, async () => {
    await assert.rejects(executeStatement("select 1"), /^Error: DATABRICKS_TOKEN is not set$/);
  });
});

test("executeStatement throws DATABRICKS_WAREHOUSE_PATH is not set when unset", async () => {
  await withEnv({ DATABRICKS_WAREHOUSE_PATH: undefined }, async () => {
    await assert.rejects(executeStatement("select 1"), /^Error: DATABRICKS_WAREHOUSE_PATH is not set$/);
  });
});

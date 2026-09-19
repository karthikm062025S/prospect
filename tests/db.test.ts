import { test } from "node:test";
import assert from "node:assert/strict";
import { query } from "../lib/db.ts";

test("query without LAKEBASE_URL fails loudly and names the variable", async () => {
  const saved = process.env.LAKEBASE_URL;
  delete process.env.LAKEBASE_URL;
  try {
    await assert.rejects(query("select 1"), /^Error: DATABASE_NOT_CONFIGURED: LAKEBASE_URL is not set$/);
  } finally {
    if (saved !== undefined) process.env.LAKEBASE_URL = saved;
  }
});

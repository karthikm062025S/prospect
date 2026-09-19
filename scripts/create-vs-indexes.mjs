#!/usr/bin/env node
// Creates the four Delta-sync Vector Search indexes on the one Free-Edition
// endpoint (DATABRICKS_VS_ENDPOINT, "scout-vs" -- RUNBOOK-databricks.md §4/§8
// caps the account at exactly one endpoint). Enables Change Data Feed on each
// source table first (required for a Delta-sync index), skips creation when
// an index already exists ("exists <name>"), polls each new index to ready,
// and exits 1 naming the index that failed.
//
// Vector Search REST shapes confirmed 2026-09-19 via Context7 (Databricks API
// docs, /websites/databricks_api) -- see lib/vector-search.ts's header for the
// exact URLs; this script only sequences those calls.
import { pathToFileURL } from "node:url";
import { executeStatement } from "../lib/databricks-sql.ts";
import { createDeltaSyncIndex, indexStatus } from "../lib/vector-search.ts";

export const INDEXES = [
  {
    name: "scout.core.archetypes_index",
    sourceTable: "scout.core.archetypes",
    primaryKey: "id",
    textColumn: "definition",
    // Unlike onet_tasks/vt_courses/vt_clubs (landed by scripts/load-datasets.mjs,
    // step 2 in the README order), scout.core.archetypes is new and owned by
    // this lane. seed-archetypes.mjs (step 4) is what POPULATES it, but the
    // Delta-sync index (step 3) needs the table to already exist -- create it
    // empty here, idempotently, so the step order in the README holds.
    ensureSourceTableSql:
      "create table if not exists scout.core.archetypes (id string, name string, definition string, aliases string) using delta",
  },
  {
    name: "scout.core.onet_tasks_index",
    sourceTable: "scout.core.onet_tasks",
    primaryKey: "task_id",
    textColumn: "task_statement",
  },
  {
    name: "scout.core.vt_courses_index",
    sourceTable: "scout.core.vt_courses",
    primaryKey: "code",
    textColumn: "description",
  },
  {
    name: "scout.core.vt_clubs_index",
    sourceTable: "scout.core.vt_clubs",
    primaryKey: "name",
    textColumn: "description",
  },
];

const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 5 * 60 * 1000;

async function waitReady(name) {
  const startedAt = Date.now();
  for (;;) {
    const status = await indexStatus(name);
    if (status.ready) return status;
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(
        `INDEX_NOT_READY: ${name} did not become ready within ${MAX_WAIT_MS}ms (${status.message ?? "no message"})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/** null (not 404) means "does not exist yet"; any other failure rethrows named. */
async function findExisting(name) {
  try {
    return await indexStatus(name);
  } catch (error) {
    if (error instanceof Error && /VECTOR_SEARCH_API_ERROR: 404/.test(error.message)) return null;
    throw error;
  }
}

export async function ensureIndex(spec) {
  const existing = await findExisting(spec.name);
  if (existing) {
    console.log(`exists ${spec.name}`);
    return;
  }
  if (spec.ensureSourceTableSql) {
    await executeStatement(spec.ensureSourceTableSql);
  }
  await executeStatement(`alter table ${spec.sourceTable} set tblproperties (delta.enableChangeDataFeed = true)`);
  await createDeltaSyncIndex(spec);
  const status = await waitReady(spec.name);
  console.log(`created ${spec.name}: ${status.indexed_row_count ?? 0} rows indexed`);
}

async function main() {
  let allOk = true;
  for (const spec of INDEXES) {
    try {
      await ensureIndex(spec);
    } catch (error) {
      console.error(`FAILED ${spec.name}: ${error instanceof Error ? error.message : String(error)}`);
      allOk = false;
    }
  }
  process.exitCode = allOk ? 0 : 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

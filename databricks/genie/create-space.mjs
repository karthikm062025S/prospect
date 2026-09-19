#!/usr/bin/env node
// Creates the "Scout: why" Genie space over scout.core from space.json via
// REST (POST /api/2.0/genie/spaces -- docs.databricks.com/api/genie/v1/
// create-space.md, confirmed via Context7 2026-09-19; the AI Dev Kit skill
// `databricks-genie-agents` references/create-genie-agent.md does the same
// through `databricks genie create-space --json` and its serialized-space.md
// gives the payload rules: version 2, 32-hex ids, array-valued text fields,
// id-sorted arrays, identifier-sorted tables, one text_instructions item).
// Idempotent by title: an existing space with the same title is reported,
// never duplicated and never altered. Prints the space id to paste into
// DATABRICKS_GENIE_SPACE_ID.
//
// Requires DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_PATH
// (never printed). Usage, from the repo root:
//   node databricks/genie/create-space.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, mkdirs } from "../../scripts/databricks-jobs.mjs";

const TITLE = "Scout: why";
const here = path.dirname(fileURLToPath(import.meta.url));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const warehouseId = requiredEnv("DATABRICKS_WAREHOUSE_PATH").split("/").filter(Boolean).pop();
if (!warehouseId) throw new Error("GENIE_CREATE: DATABRICKS_WAREHOUSE_PATH is malformed");

const listed = await api("GET", "/api/2.0/genie/spaces?page_size=200");
const existing = (listed.spaces ?? []).find((s) => s.title === TITLE);
if (existing) {
  console.log(`space "${TITLE}" already exists, space_id = ${existing.space_id} (left untouched)`);
  process.exit(0);
}

const me = await api("GET", "/api/2.0/preview/scim/v2/Me");
const parentPath = `/Workspace/Users/${me.userName}/scout/genie`;
await mkdirs(`${parentPath}/placeholder`);

const serialized = JSON.parse(fs.readFileSync(path.join(here, "space.json"), "utf-8"));
const created = await api("POST", "/api/2.0/genie/spaces", {
  warehouse_id: warehouseId,
  title: TITLE,
  description:
    "The judge-facing why tool: ask the Scout lakehouse (postings, companies, archetypes, O*NET task exposure, VT catalog) a question and see the SQL it ran.",
  parent_path: parentPath,
  serialized_space: JSON.stringify(serialized),
});
console.log(`created space "${TITLE}", space_id = ${created.space_id}`);

#!/usr/bin/env node
// One runnable check for the Orchestrator job: run-now `scout-orchestrator`,
// poll to a terminal state, then read back the row that run appended to
// scout.core.orchestrator_runs. Exits 1 (naming the run) unless the run
// finished SUCCESS and its row says success or skipped -- a 404 from
// /api/match, a missing secret or a Lakebase failure all surface here by
// name, never as a green exit.
//
// Requires DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_PATH.
// Usage: node --experimental-strip-types scripts/orchestrator-smoke.mjs
import { executeStatement } from "../lib/databricks-sql.ts";
import { findJobByName, runNowAndPoll, summarizeRun } from "./databricks-jobs.mjs";

const jobId = await findJobByName("scout-orchestrator");
if (!jobId) throw new Error("ORCHESTRATOR_SMOKE: job scout-orchestrator not found (run databricks/orchestrator/create-job.mjs)");

const run = await runNowAndPoll(jobId);
const summary = summarizeRun(run);
console.log("run:", JSON.stringify(summary));

const { columns, rows } = await executeStatement(
  `select started_at, job_run_id, watermark, new_drops, profiles, profiles_rescored, nudges_written, status, error
   from scout.core.orchestrator_runs where job_run_id = '${summary.run_id}' order by started_at desc limit 1`,
);
const row = rows[0] ? Object.fromEntries(columns.map((c, i) => [c, rows[0][i]])) : null;
console.log("orchestrator_runs row:", JSON.stringify(row));

if (summary.result_state !== "SUCCESS") {
  console.error(`ORCHESTRATOR_SMOKE: run ${summary.run_id} ended ${summary.result_state}: ${summary.state_message}`);
  process.exit(1);
}
if (!row || !["success", "skipped"].includes(row.status)) {
  console.error(`ORCHESTRATOR_SMOKE: run ${summary.run_id} wrote status ${row?.status ?? "no row"}`);
  process.exit(1);
}

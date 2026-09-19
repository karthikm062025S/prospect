#!/usr/bin/env node
// Imports orchestrate.py into the workspace and creates the scheduled job
// `scout-orchestrator` from job.json (the sync lane's create-job.ps1 pattern,
// on the repo's own REST helpers in scripts/databricks-jobs.mjs). Idempotent:
// a job with that exact name already existing is reported, never duplicated
// and never altered.
//
// Kit patterns (databricks/databricks-agent-skills): `databricks-jobs`
// SKILL.md — a notebook_task with no cluster config runs on serverless, job
// parameters reach the notebook through dbutils.widgets, `{{job.run_id}}` is
// a dynamic value reference; references/triggers-schedules.md — cron
// (`quartz_cron_expression`, `timezone_id`, `pause_status: UNPAUSED`) is the
// right trigger when the run must land at a clock time, here :20 so it
// follows the sync job's :00.
//
// Requires DATABRICKS_HOST + DATABRICKS_TOKEN in the environment (never
// printed). Usage, from the repo root:
//   node databricks/orchestrator/create-job.mjs --notebook-path /Workspace/Users/<you>/scout/orchestrator/orchestrate
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, createJob, findJobByName, importNotebook } from "../../scripts/databricks-jobs.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const flagIndex = process.argv.indexOf("--notebook-path");
let notebookPath = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
if (!notebookPath) {
  const me = await api("GET", "/api/2.0/preview/scim/v2/Me");
  if (!me.userName) throw new Error("ORCHESTRATOR_CREATE: could not resolve the workspace user for the notebook path");
  notebookPath = `/Workspace/Users/${me.userName}/scout/orchestrator/orchestrate`;
}

await importNotebook(path.join(here, "orchestrate.py"), notebookPath);
console.log(`imported notebook to ${notebookPath}`);

const payload = JSON.parse(fs.readFileSync(path.join(here, "job.json"), "utf-8"));
payload.tasks[0].notebook_task.notebook_path = notebookPath;

const existing = await findJobByName(payload.name);
if (existing) {
  console.log(`job ${payload.name} already exists, job_id = ${existing} (left untouched; notebook re-imported)`);
} else {
  const jobId = await createJob(payload);
  console.log(`created job ${payload.name}, job_id = ${jobId}`);
}

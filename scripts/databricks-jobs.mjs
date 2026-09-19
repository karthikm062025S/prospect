#!/usr/bin/env node
// Generic helpers for driving Databricks Jobs 2.2 + Workspace import over REST
// (the Databricks console blocks browser automation, so every Databricks-side
// step in this lane goes through these calls). No new deps: built-in fetch only.
//
// Docs relied on (fetched via WebFetch this session):
//   - Workspace import: https://docs.databricks.com/api/workspace/workspace/import
//     (POST /api/2.0/workspace/import, base64 `content`, format SOURCE + language PYTHON for a .py notebook source file)
//   - Jobs 2.2 create: https://docs.databricks.com/api/workspace/jobs/create
//   - Jobs 2.2 run-now: https://docs.databricks.com/api/workspace/jobs/runnow
//   - Jobs 2.2 runs/submit (one-time run, no persistent job): https://docs.databricks.com/api/workspace/jobs/submit
//   - Jobs 2.2 runs/get: https://docs.databricks.com/api/workspace/jobs/getrun
//
// Usage: import { api, importNotebook, createJob, runNowAndPoll, submitAndPoll } from "./databricks-jobs.mjs"

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function host() {
  return requiredEnv("DATABRICKS_HOST").replace(/\/$/, "");
}

export async function api(method, path, body) {
  const token = requiredEnv("DATABRICKS_TOKEN");
  const res = await fetch(`${host()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`DATABRICKS_API_ERROR: ${method} ${path} -> ${res.status} ${text.slice(0, 800)}`);
  }
  return json;
}

/** Creates every ancestor directory of a workspace path (mkdirs is create-if-absent, idempotent). */
export async function mkdirs(workspacePath) {
  const parent = workspacePath.split("/").slice(0, -1).join("/");
  if (!parent) return;
  await api("POST", "/api/2.0/workspace/mkdirs", { path: parent });
}

/** Imports a local .py SOURCE-format notebook file to a workspace path (create-if-absent, overwrite=true). */
export async function importNotebook(localPath, workspacePath) {
  await mkdirs(workspacePath);
  const fs = await import("node:fs");
  const content = fs.readFileSync(localPath, "utf-8");
  const encoded = Buffer.from(content, "utf-8").toString("base64");
  await api("POST", "/api/2.0/workspace/import", {
    path: workspacePath,
    format: "SOURCE",
    language: "PYTHON",
    content: encoded,
    overwrite: true,
  });
  return workspacePath;
}

/** Creates a job from a job.json payload object (already fixed up: notebook_path, base_parameters). Returns job_id. */
export async function createJob(payload) {
  const res = await api("POST", "/api/2.2/jobs/create", payload);
  return res.job_id;
}

/** Finds an existing job by exact name, or null. */
export async function findJobByName(name) {
  const res = await api("GET", `/api/2.2/jobs/list?name=${encodeURIComponent(name)}`);
  const jobs = res.jobs ?? [];
  const match = jobs.find((j) => j.settings?.name === name);
  return match ? match.job_id : null;
}

async function pollRun(runId, { intervalMs = 5000, maxWaitMs = 15 * 60 * 1000 } = {}) {
  const startedAt = Date.now();
  for (;;) {
    const run = await api("GET", `/api/2.2/jobs/runs/get?run_id=${runId}`);
    const state = run.state ?? {};
    const lifeCycle = state.life_cycle_state;
    if (lifeCycle === "TERMINATED" || lifeCycle === "SKIPPED" || lifeCycle === "INTERNAL_ERROR") {
      return run;
    }
    if (Date.now() - startedAt > maxWaitMs) {
      throw new Error(`DATABRICKS_RUN_TIMEOUT: run ${runId} still ${lifeCycle} after ${maxWaitMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Triggers run-now on an existing job and polls to a terminal state. Returns the full run object. */
export async function runNowAndPoll(jobId, opts) {
  const res = await api("POST", "/api/2.2/jobs/run-now", { job_id: jobId });
  return pollRun(res.run_id, opts);
}

/** Submits a one-time run (no persistent job object) and polls to a terminal state. Returns the full run object. */
export async function submitAndPoll(runName, tasks, opts) {
  const res = await api("POST", "/api/2.2/jobs/runs/submit", { run_name: runName, tasks });
  const run = await pollRun(res.run_id, opts);
  return { runId: res.run_id, run };
}

export function summarizeRun(run) {
  const state = run.state ?? {};
  return {
    life_cycle_state: state.life_cycle_state,
    result_state: state.result_state,
    state_message: state.state_message,
    run_id: run.run_id,
    run_page_url: run.run_page_url,
  };
}

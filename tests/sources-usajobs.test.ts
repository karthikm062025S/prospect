import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchRows } from "../scripts/sources/usajobs.mjs";

// MISSION L2 (VTHacks 14, 2026-09-19). USAJOBS_API_KEY/USAJOBS_USER_AGENT are
// NOT provisioned in this environment (Done Means B) — proven live during
// this build: a real request with no Authorization-Key returns a real 401
// (see tests/fixtures/sources/MANIFEST.md), confirming the host/path are
// correct and the API is auth-gated, not dead.
const here = dirname(fileURLToPath(import.meta.url));

test("fetchRows throws the exact named failure when USAJOBS_API_KEY is unset (no network call)", async () => {
  const before = process.env.USAJOBS_API_KEY;
  const beforeUA = process.env.USAJOBS_USER_AGENT;
  delete process.env.USAJOBS_API_KEY;
  delete process.env.USAJOBS_USER_AGENT;
  try {
    await assert.rejects(() => fetchRows({ limit: 5 }), /USAJOBS_API_KEY is not set/);
  } finally {
    if (before !== undefined) process.env.USAJOBS_API_KEY = before;
    if (beforeUA !== undefined) process.env.USAJOBS_USER_AGENT = beforeUA;
  }
});

test("fetchRows throws the exact named failure when USAJOBS_USER_AGENT is unset", async () => {
  const before = process.env.USAJOBS_API_KEY;
  const beforeUA = process.env.USAJOBS_USER_AGENT;
  process.env.USAJOBS_API_KEY = "test-key";
  delete process.env.USAJOBS_USER_AGENT;
  try {
    await assert.rejects(() => fetchRows({ limit: 5 }), /USAJOBS_USER_AGENT is not set/);
  } finally {
    if (before !== undefined) process.env.USAJOBS_API_KEY = before;
    else delete process.env.USAJOBS_API_KEY;
    if (beforeUA !== undefined) process.env.USAJOBS_USER_AGENT = beforeUA;
  }
});

test("fetchRows surfaces the REAL captured 401 as a named HTTP failure when a (wrong) key is set", async () => {
  const raw = await readFile(join(here, "fixtures", "sources", "usajobs-401.raw.json"), "utf8");
  const fixture = JSON.parse(raw);
  const fakeFetch = (async () => ({ ok: false, status: 401, json: async () => fixture })) as unknown as typeof fetch;
  const before = process.env.USAJOBS_API_KEY;
  const beforeUA = process.env.USAJOBS_USER_AGENT;
  process.env.USAJOBS_API_KEY = "wrong-key";
  process.env.USAJOBS_USER_AGENT = "karthik.mandli2006@gmail.com";
  try {
    await assert.rejects(() => fetchRows({ limit: 5, fetch: fakeFetch }), /HTTP 401/);
  } finally {
    if (before !== undefined) process.env.USAJOBS_API_KEY = before;
    else delete process.env.USAJOBS_API_KEY;
    if (beforeUA !== undefined) process.env.USAJOBS_USER_AGENT = beforeUA;
    else delete process.env.USAJOBS_USER_AGENT;
  }
});

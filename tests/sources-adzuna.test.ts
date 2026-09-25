import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchRows } from "../scripts/sources/adzuna.mjs";

// VTHacks 14, 2026-09-19. ADZUNA_APP_ID/ADZUNA_APP_KEY are NOT
// provisioned in this environment (Done Means B) — proven live during this
// build: a real request with no app_id/app_key returns a real HTTP 400 (see
// tests/fixtures/sources/MANIFEST.md), confirming the host/path are correct
// and reachable, not dead.
const here = dirname(fileURLToPath(import.meta.url));

test("fetchRows throws the exact named failure when ADZUNA_APP_ID is unset (no network call)", async () => {
  const before = process.env.ADZUNA_APP_ID;
  const beforeKey = process.env.ADZUNA_APP_KEY;
  delete process.env.ADZUNA_APP_ID;
  delete process.env.ADZUNA_APP_KEY;
  try {
    await assert.rejects(() => fetchRows({ limit: 5 }), /ADZUNA_APP_ID is not set/);
  } finally {
    if (before !== undefined) process.env.ADZUNA_APP_ID = before;
    if (beforeKey !== undefined) process.env.ADZUNA_APP_KEY = beforeKey;
  }
});

test("fetchRows throws the exact named failure when ADZUNA_APP_KEY is unset", async () => {
  const before = process.env.ADZUNA_APP_ID;
  const beforeKey = process.env.ADZUNA_APP_KEY;
  process.env.ADZUNA_APP_ID = "test-id";
  delete process.env.ADZUNA_APP_KEY;
  try {
    await assert.rejects(() => fetchRows({ limit: 5 }), /ADZUNA_APP_KEY is not set/);
  } finally {
    if (before !== undefined) process.env.ADZUNA_APP_ID = before;
    else delete process.env.ADZUNA_APP_ID;
    if (beforeKey !== undefined) process.env.ADZUNA_APP_KEY = beforeKey;
  }
});

test("fetchRows surfaces the REAL captured 400 as a named HTTP failure when (wrong) keys are set", async () => {
  const raw = await readFile(join(here, "fixtures", "sources", "adzuna-400.raw.html"), "utf8");
  const fakeFetch = (async () => ({ ok: false, status: 400, text: async () => raw, json: async () => JSON.parse(raw) })) as unknown as typeof fetch;
  const before = process.env.ADZUNA_APP_ID;
  const beforeKey = process.env.ADZUNA_APP_KEY;
  process.env.ADZUNA_APP_ID = "wrong-id";
  process.env.ADZUNA_APP_KEY = "wrong-key";
  try {
    await assert.rejects(() => fetchRows({ limit: 5, fetch: fakeFetch }), /HTTP 400/);
  } finally {
    if (before !== undefined) process.env.ADZUNA_APP_ID = before;
    else delete process.env.ADZUNA_APP_ID;
    if (beforeKey !== undefined) process.env.ADZUNA_APP_KEY = beforeKey;
    else delete process.env.ADZUNA_APP_KEY;
  }
});

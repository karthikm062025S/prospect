import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchRows } from "../scripts/sources/workday.mjs";

// MISSION L2 (VTHacks 14, 2026-09-19). The fixture is an UNMODIFIED real
// capture (see tests/fixtures/sources/MANIFEST.md for URL + capture time) of
// PwC's public Workday CXS endpoint — one of the >=8 live-verified tenants in
// scripts/sources/workday-tenants.json. The injected fetch answers ONLY the
// PwC/US_Experienced_Careers URL with that real body; every other verified
// tenant in the real tenants.json gets a 404 from this fake fetch, which
// fetchRows must swallow per-tenant (log + continue) rather than throw —
// exactly what a real partial-outage run looks like.
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_URL = "https://pwc.wd3.myworkdayjobs.com/wday/cxs/pwc/US_Experienced_Careers/jobs";

async function loadFixture() {
  const raw = await readFile(join(here, "fixtures", "sources", "workday-pwc-us-experienced.raw.json"), "utf8");
  return JSON.parse(raw);
}

function makeFakeFetch(fixtureBody: unknown) {
  return (async (url: string) => {
    if (url === FIXTURE_URL) {
      return { ok: true, status: 200, json: async () => fixtureBody } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

test("fetchRows parses the real PwC fixture into watcher-payload-shaped rows", async () => {
  const fixture = await loadFixture();
  const fakeFetch = makeFakeFetch(fixture);
  const rows = await fetchRows({ limit: 20, fetch: fakeFetch });

  assert.ok(rows.length > 0, "at least one row from the one tenant the fake fetch answers");
  for (const r of rows) {
    assert.equal(r.company, "PwC");
    assert.equal(r.source, "workday-tenant:pwc");
    assert.ok(r.title.length > 0);
    // "Posted Yesterday" (both real fixture rows) is RECONSTRUCTED, never a
    // real timestamp — posted_at/source_posted_at must both be absent/null.
    assert.equal(r.posted_at, null);
    assert.equal("source_posted_at" in r, false, "never fabricate a real timestamp from a relative postedOn string");
  }
  const titles = rows.map((r) => r.title);
  assert.ok(titles.includes("Finance Data, Analytics & AI - Associate"));
});

test("fetchRows continues past a failed tenant instead of throwing (partial outage is normal)", async () => {
  // A fetch that answers NOTHING (every tenant 404s) must return an EMPTY
  // array, not throw — one dead tenant (or 11) is not the same failure class
  // as workday-tenants.json itself being missing/empty.
  const deadFetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
  const rows = await fetchRows({ limit: 5, fetch: deadFetch });
  assert.deepEqual(rows, []);
});

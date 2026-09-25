import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { importBaseline, baselineDir } from "../scripts/import-baseline.mjs";
import { makeTestDb, type TestDb } from "./helpers/test-db.ts";

// Lakebase is seeded from the REAL 2026-09-04 export,
// never from invented rows. This runs the same importer the CLI runs, against
// the real schema in pglite, and asserts the export's own counts
// (db/baseline-2026-09/counts.json: companies 627, roles 1295, tombstones 412,
// applications 43, outreach 4). The export is gitignored: a checkout without it
// fails here, named, rather than skipping.
const DIR = baselineDir();

let db: TestDb;
before(async () => {
  assert.ok(existsSync(DIR), `baseline export missing: expected ${DIR}/{companies,roles,tombstones,applications,outreach}.json (copy it from the main checkout)`);
  db = await makeTestDb();
});
after(() => db?.close());

const EXPECTED = { companies: 627, roles: 1295, tombstones: 412, applications: 43, outreach: 4 };
type Report = Record<string, { inserted: number; skipped?: number; total?: number }>;
const run = () => importBaseline(db.q, DIR) as unknown as Promise<Report>;

test("first import inserts every row of the real export, in FK order, in one transaction", async () => {
  const report = await run();
  for (const [table, total] of Object.entries(EXPECTED)) {
    assert.deepEqual(report[table], { inserted: total, skipped: 0, total }, table);
    const [{ n }] = await db.q<{ n: number }>(`select count(*)::int as n from ${table}`);
    assert.equal(n, total, `${table} rows in the database`);
  }
  // Derived from real rows: one user_roles link per application that carries a role_id.
  const [{ linked }] = await db.q<{ linked: number }>("select count(*)::int as linked from applications where role_id is not null");
  assert.equal(report.user_roles.inserted, linked);
  const [{ n }] = await db.q<{ n: number }>("select count(*)::int as n from user_roles where application_id is not null");
  assert.equal(n, linked);
});

test("second import is a no-op: 0 inserted, every row skipped as existing", async () => {
  const report = await run();
  for (const [table, total] of Object.entries(EXPECTED)) {
    assert.deepEqual(report[table], { inserted: 0, skipped: total, total }, table);
  }
  assert.equal(report.user_roles.inserted, 0);
});

test("the imported rows keep their real shapes: dates as YYYY-MM-DD, timestamps as ISO, views readable", async () => {
  const [role] = await db.q<{ posted_at: string | null; created_at: string; families: string[] | null }>(
    "select posted_at, created_at, families from roles where posted_at is not null order by created_at limit 1",
  );
  assert.match(role.posted_at as string, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(role.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const [{ n }] = await db.q<{ n: number }>("select count(*)::int as n from roles_public where lifecycle = 'open'");
  assert.equal(n, EXPECTED.roles, "every exported role is open (the export predates any applied lifecycle)");
  const [{ c }] = await db.q<{ c: number }>("select count(*)::int as c from companies_public");
  assert.equal(c, EXPECTED.companies);
});

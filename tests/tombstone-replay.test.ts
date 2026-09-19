import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { upsertRole } from "../lib/upsert-role.ts";
import { makeTestDb, insertRow, truncateAll, uuid, type TestDb } from "./helpers/test-db.ts";

// RB-008: a deleted role is tombstoned by (company_id, title, posted_at) so a
// watcher/MCP replay of the SAME posting can never resurrect it. The
// skip_tombstoned decision lives entirely inside upsertRole's own tombstone
// lookup, before resolveRoleUpsert is ever called, so proving the replay needs
// a real database: the pglite-backed schema in tests/helpers/test-db.ts.

// Role shape pulled from tests/fixtures/feeds/simplify.md (Stripe / Software
// Engineer Intern / the real Greenhouse-listing link).
const STRIPE_ROLE = {
  company: "Stripe",
  title: "Software Engineer Intern",
  link: "https://stripe.com/jobs/listing/software-engineer-intern/1234?utm_source=Simplify&ref=Simplify",
};
const COMPANY = uuid(10);

let db: TestDb;
before(async () => {
  db = await makeTestDb();
});
after(() => db.close());
beforeEach(async () => {
  await truncateAll(db.q);
  await insertRow(db.q, "companies", { id: COMPANY, name: "Stripe" });
});

test("replay: identical re-POST of a tombstoned (company,title,posted_at) triple stays skip_tombstoned", async () => {
  await insertRow(db.q, "tombstones", { company_id: COMPANY, title: STRIPE_ROLE.title, posted_at: "2026-06-01" });
  const result = await upsertRole(db.q, { ...STRIPE_ROLE, posted_at: "2026-06-01" });
  assert.equal(result.action, "skip_tombstoned");
});

test("replay: the null-posted_at variant also stays skip_tombstoned", async () => {
  await insertRow(db.q, "tombstones", { company_id: COMPANY, title: STRIPE_ROLE.title, posted_at: null });
  const result = await upsertRole(db.q, { ...STRIPE_ROLE, posted_at: null });
  assert.equal(result.action, "skip_tombstoned");
});

test("non-matching replay: a different posted_at is NOT caught by the tombstone (dedup-triple semantics)", async () => {
  await insertRow(db.q, "tombstones", { company_id: COMPANY, title: STRIPE_ROLE.title, posted_at: "2026-06-01" });
  const result = await upsertRole(db.q, { ...STRIPE_ROLE, posted_at: "2026-07-01" });
  assert.equal(result.action, "insert");
});

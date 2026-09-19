import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { upsertRole } from "../lib/upsert-role.ts";
import { makeTestDb, insertRow, truncateAll, uuid, type TestDb } from "./helpers/test-db.ts";

// D34 (MISSION v5): location flows through the SAME entry point
// app/api/watcher/route.ts calls per role, upsertRole, against the real schema
// in pglite. Proves: accepted + stored on insert, backfilled on update only
// when the stored value is null, and never churned once set.

const ROLE = {
  company: "Acme",
  title: "Software Engineer Intern",
  link: "https://acme.example/jobs/1",
  posted_at: "2026-08-01",
};
const COMPANY = uuid(10);

let db: TestDb;
before(async () => {
  db = await makeTestDb();
});
after(() => db.close());
beforeEach(async () => {
  await truncateAll(db.q);
  await insertRow(db.q, "companies", { id: COMPANY, name: "Acme" });
});

const seedRole = (location: string | null) =>
  insertRow(db.q, "roles", { company_id: COMPANY, title: ROLE.title, posted_at: ROLE.posted_at, lifecycle: "open", location });

test("insert stores the posted location", async () => {
  const result = await upsertRole(db.q, { ...ROLE, location: "New York, NY" });
  assert.equal(result.action, "insert");
  assert.equal((result.role as { location: string }).location, "New York, NY");
});

test("insert with no location leaves it unset (null column)", async () => {
  const result = await upsertRole(db.q, { ...ROLE });
  assert.equal((result.role as { location: string | null }).location, null);
});

test("update backfills location when the stored value is null", async () => {
  await seedRole(null);
  const result = await upsertRole(db.q, { ...ROLE, location: "Austin, TX" });
  assert.equal(result.action, "update");
  assert.equal((result.role as { location: string }).location, "Austin, TX");
});

test("update never overwrites an already-set location (no churn)", async () => {
  await seedRole("Seattle, WA");
  const result = await upsertRole(db.q, { ...ROLE, location: "Austin, TX" });
  assert.equal(result.action, "update");
  assert.equal((result.role as { location: string }).location, "Seattle, WA");
});

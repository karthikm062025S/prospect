import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { fetchApplicationJd } from "../lib/application-jd.ts";
import { makeTestDb, insertRow, truncateAll, uuid, type TestDb } from "./helpers/test-db.ts";

const UID = uuid(1);
const OTHER = uuid(2);
const COMPANY = uuid(10);
const A1 = uuid(101);
const A2 = uuid(102);

let db: TestDb;
before(async () => {
  db = await makeTestDb();
});
after(() => db.close());
beforeEach(async () => {
  await truncateAll(db.q);
  await insertRow(db.q, "companies", { id: COMPANY, name: "Acme" });
});

const seed = (row: Record<string, unknown>) =>
  insertRow(db.q, "applications", { company_id: COMPANY, role: "SWE Intern", ...row });

// The read behind getApplicationJdAction (A15): the Applications page payload
// no longer carries jd_snapshot, so the pane fetches exactly the selected
// application's posting — and never throws on a miss.

test("fetchApplicationJd returns the stored snapshot and its capture time", async () => {
  await seed({ id: A1, user_id: UID, jd_snapshot: "<p>the posting</p>", jd_snapshot_at: "2026-08-24T12:00:00.000Z" });
  await seed({ id: A2, user_id: OTHER, jd_snapshot: "<p>other</p>", jd_snapshot_at: "2026-08-01T12:00:00.000Z" });
  const result = await fetchApplicationJd(db.q, UID, A1);
  assert.deepEqual(result, { html: "<p>the posting</p>", captured_at: "2026-08-24T12:00:00.000Z" });
});

test("fetchApplicationJd reports 'nothing captured' for an application with no snapshot", async () => {
  await seed({ id: A1, user_id: UID, jd_snapshot: null, jd_snapshot_at: null });
  assert.deepEqual(await fetchApplicationJd(db.q, UID, A1), { html: null, captured_at: null });
});

test("fetchApplicationJd returns nulls instead of throwing when the row is gone", async () => {
  assert.deepEqual(await fetchApplicationJd(db.q, UID, uuid(999)), { html: null, captured_at: null });
});

test("fetchApplicationJd cannot read another user's snapshot", async () => {
  await seed({ id: A1, user_id: OTHER, jd_snapshot: "<p>private</p>", jd_snapshot_at: "2026-08-24T12:00:00.000Z" });
  assert.deepEqual(await fetchApplicationJd(db.q, UID, A1), { html: null, captured_at: null });
});

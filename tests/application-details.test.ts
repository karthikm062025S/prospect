import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { setApplicationStatus, updateApplicationDetails } from "../lib/application-details.ts";
import { makeTestDb, insertRow, truncateAll, uuid, type TestDb } from "./helpers/test-db.ts";

const UID = uuid(1);
const OTHER = uuid(2);
const COMPANY = uuid(10);
const APP = uuid(100);
const OLD = "2026-08-01T00:00:00.000Z";

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
  insertRow(db.q, "applications", { id: APP, company_id: COMPANY, role: "SWE Intern", status: "applied", status_changed_at: OLD, ...row });
const readApp = async () => (await db.q<Record<string, unknown>>("select * from applications where id = $1", [APP]))[0];

test("changes status and stamps status_changed_at for the owner", async () => {
  await seed({ user_id: UID });
  const result = await setApplicationStatus(db.q, UID, APP, "oa", "2026-08-23T10:00:00.000Z");
  assert.deepEqual(result, { ok: true });
  const row = await readApp();
  assert.equal(row.status, "oa");
  assert.equal(row.status_changed_at, "2026-08-23T10:00:00.000Z");
});

test("same status does not reset status_changed_at", async () => {
  await seed({ user_id: UID });
  const result = await setApplicationStatus(db.q, UID, APP, "applied", "2026-08-23T10:00:00.000Z");
  assert.deepEqual(result, { ok: true });
  assert.equal((await readApp()).status_changed_at, OLD);
});

test("status writer cannot find another user's application", async () => {
  await seed({ user_id: OTHER });
  assert.deepEqual(
    await setApplicationStatus(db.q, UID, APP, "offer", "2026-08-23T10:00:00.000Z"),
    { ok: false, reason: "not_found" },
  );
  assert.equal((await readApp()).status, "applied");
});

test("detail updates write only allowed fields and never the status clock", async () => {
  await seed({ user_id: UID, notes: null });
  const result = await updateApplicationDetails(
    db.q,
    UID,
    APP,
    { notes: "spoke to recruiter", status: "offer" } as never,
    "2026-08-24T10:00:00.000Z",
  );
  assert.deepEqual(result, { ok: true });
  const row = await readApp();
  assert.equal(row.notes, "spoke to recruiter");
  assert.equal(row.status, "applied");
  assert.equal(row.status_changed_at, OLD);
});

test("detail updates reject malformed dates and empty patches", async () => {
  await seed({ user_id: UID, follow_up_at: null });
  assert.deepEqual(
    await updateApplicationDetails(db.q, UID, APP, { follow_up_at: "next tuesday" }, "2026-08-24T10:00:00.000Z"),
    { ok: false, reason: "invalid_date" },
  );
  assert.deepEqual(await updateApplicationDetails(db.q, UID, APP, {}, "2026-08-24T10:00:00.000Z"), {
    ok: false,
    reason: "empty_patch",
  });
});

test("detail updates cannot touch another user's application", async () => {
  await seed({ user_id: OTHER, notes: "private" });
  assert.deepEqual(
    await updateApplicationDetails(db.q, UID, APP, { notes: "changed" }, "2026-08-24T10:00:00.000Z"),
    { ok: false, reason: "not_found" },
  );
  assert.equal((await readApp()).notes, "private");
});

// The detail pane's Resume used field is free text (no upload, MISSION.md
// D20): typing saves it, and blanking it must CLEAR the column rather than
// be rejected as an empty patch.
test("resume_file round-trips and an emptied field clears the column", async () => {
  await seed({ user_id: UID, resume_file: null });
  assert.deepEqual(
    await updateApplicationDetails(db.q, UID, APP, { resume_file: "  karthik_mandli_resume_swe  " }, "2026-09-05T10:00:00.000Z"),
    { ok: true },
  );
  assert.equal((await readApp()).resume_file, "karthik_mandli_resume_swe");

  assert.deepEqual(
    await updateApplicationDetails(db.q, UID, APP, { resume_file: "" }, "2026-09-05T11:00:00.000Z"),
    { ok: true },
  );
  const row = await readApp();
  assert.equal(row.resume_file, null);
  assert.equal(row.status_changed_at, OLD);
});

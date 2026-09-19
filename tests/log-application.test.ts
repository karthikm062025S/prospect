import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { logApplication } from "../lib/log-application.ts";
import { makeTestDb, insertRow, truncateAll, uuid, type TestDb } from "./helpers/test-db.ts";

const UID = uuid(1);
const COMPANY = uuid(10);

let db: TestDb;
before(async () => {
  db = await makeTestDb();
});
after(() => db.close());
beforeEach(() => truncateAll(db.q));

// RB-026 (S7 audit MAJOR 1): logApplication is the ONE insert path for
// applications (the UI apply funnel via applyToRole, the log_application
// MCP tool). Creation IS the first status set, so the insert must stamp
// status_changed_at — the migration only backfilled rows that already
// existed, and isStale() returns false on null, which would make the
// stale badge impossible for every application logged after it.

test("logApplication stamps status_changed_at on the inserted row (injectable clock)", async () => {
  await insertRow(db.q, "companies", { id: COMPANY, name: "Roblox", is_watched: true, watch_status: "open" });
  const app = await logApplication(db.q, UID, { company: "Roblox", role: "SWE Intern" }, "2026-08-24T10:00:00.000Z");
  assert.equal(app.status_changed_at, "2026-08-24T10:00:00.000Z");
  const rows = await db.q<Record<string, unknown>>("select * from applications");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status_changed_at, "2026-08-24T10:00:00.000Z");
  assert.equal(rows[0].company_id, COMPANY);
  assert.equal(rows[0].user_id, UID);
  // the applied-lock flip is unchanged by the stamp
  const companies = await db.q<{ watch_status: string }>("select watch_status from companies");
  assert.equal(companies[0].watch_status, "applied_lock");
});

test("logApplication without an explicit clock still stamps a current ISO timestamp", async () => {
  const before = Date.now();
  const app = await logApplication(db.q, UID, { company: "New Co", role: "Intern" });
  const stamped = new Date(app.status_changed_at as string).getTime();
  assert.ok(Number.isFinite(stamped) && stamped >= before - 1000 && stamped <= Date.now() + 1000, `got ${app.status_changed_at}`);
  // an unknown company is created as a one-off, unwatched
  const companies = await db.q<{ name: string; is_watched: boolean }>("select name, is_watched from companies");
  assert.deepEqual(companies, [{ name: "New Co", is_watched: false }]);
  // date_applied defaults to today as a plain calendar string
  assert.match(app.date_applied, /^\d{4}-\d{2}-\d{2}$/);
});

test("companies_name_ci_uidx rejects two company rows that differ only by case", async () => {
  await insertRow(db.q, "companies", { id: COMPANY, name: "Meta" });
  await assert.rejects(insertRow(db.q, "companies", { name: "META" }), /DB_QUERY_FAILED \(companies\).*companies_name_ci_uidx/);
  const [{ n }] = await db.q<{ n: number }>("select count(*)::int as n from companies");
  assert.equal(n, 1);
});

test("logApplication matches the company name exactly (case-insensitive), never as a substring", async () => {
  await insertRow(db.q, "companies", { id: COMPANY, name: "Meta" });
  await logApplication(db.q, UID, { company: "meta", role: "Intern" });
  await logApplication(db.q, UID, { company: "Metabase", role: "Intern" });
  const companies = await db.q<{ name: string }>("select name from companies order by name");
  assert.deepEqual(companies.map((c) => c.name), ["Meta", "Metabase"]);
});

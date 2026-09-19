import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { applyToRole, applyResultError } from "../lib/apply-role.ts";
import { makeTestDb, insertRow, truncateAll, uuid, type TestDb } from "./helpers/test-db.ts";

const USER_A = uuid(1);
const USER_B = uuid(2);
const COMPANY = uuid(10);
const ROLE = uuid(20);
const APP_B = uuid(30);

let db: TestDb;
before(async () => {
  db = await makeTestDb();
});
after(() => db.close());
beforeEach(async () => {
  await truncateAll(db.q);
  await insertRow(db.q, "companies", { id: COMPANY, name: "Acme" });
  await insertRow(db.q, "roles", {
    id: ROLE,
    company_id: COMPANY,
    title: "Software Engineer Intern",
    link: "https://example.com/role",
    lifecycle: "open",
  });
});

const userRoles = () =>
  db.q<{ user_id: string; role_id: string; application_id: string | null }>(
    "select user_id, role_id, application_id from user_roles order by user_id",
  );
const applications = () => db.q<{ id: string; user_id: string }>("select id, user_id from applications");

test("applyToRole scopes the existing link lookup and new link row to the current user", async () => {
  await insertRow(db.q, "applications", { id: APP_B, user_id: USER_B, company_id: COMPANY, role: "SWE", role_id: ROLE });
  await insertRow(db.q, "user_roles", { user_id: USER_B, role_id: ROLE, application_id: APP_B });

  const result = await applyToRole(db.q, USER_A, ROLE);

  assert.equal(result.ok, true);
  const apps = await applications();
  assert.equal(apps.length, 2);
  const mine = apps.find((a) => a.user_id === USER_A);
  assert.ok(mine, "user A's application row exists");
  assert.deepEqual(await userRoles(), [
    { user_id: USER_A, role_id: ROLE, application_id: mine.id },
    { user_id: USER_B, role_id: ROLE, application_id: APP_B },
  ]);
});

// L8 audit item 4b: a second confirm on a role the user already linked must
// come back as an explicit reason, never a silent { ok: true } with nothing
// recorded (app/actions.ts confirmAppliedAction / app/role-actions.ts
// markAlreadyAppliedAction both mapped this reason to a no-op before).
test("applyToRole reports already_applied instead of inserting a second application", async () => {
  const first = await applyToRole(db.q, USER_A, ROLE);
  assert.equal(first.ok, true);
  assert.equal((await applications()).length, 1);

  const second = await applyToRole(db.q, USER_A, ROLE);
  assert.equal(second.ok, false);
  assert.equal(!second.ok && second.reason, "already_applied");
  // The second call must not have inserted a duplicate application.
  assert.equal((await applications()).length, 1);
});

test("applyToRole copies the role's snapshot onto the application and clears the pending click", async () => {
  await db.q("update roles set jd_snapshot = '<p>jd</p>', jd_snapshot_at = '2026-09-01T00:00:00.000Z' where id = $1", [ROLE]);
  await insertRow(db.q, "user_roles", { user_id: USER_A, role_id: ROLE, apply_clicked_at: "2026-09-02T00:00:00.000Z" });
  const result = await applyToRole(db.q, USER_A, ROLE, "resume_v3");
  assert.ok(result.ok);
  assert.equal(result.application.jd_snapshot, "<p>jd</p>");
  assert.equal(result.application.resume_file, "resume_v3");
  assert.equal(result.application.status, "applied");
  const [link] = await db.q<{ apply_clicked_at: string | null; application_id: string }>(
    "select apply_clicked_at, application_id from user_roles where user_id = $1 and role_id = $2",
    [USER_A, ROLE],
  );
  assert.equal(link.apply_clicked_at, null);
  assert.equal(link.application_id, result.application.id);
});

test("applyToRole refuses a role that is not open", async () => {
  await db.q("update roles set lifecycle = 'applied' where id = $1", [ROLE]);
  assert.deepEqual(await applyToRole(db.q, USER_A, ROLE), { ok: false, reason: "not_found" });
  assert.deepEqual(await applyToRole(db.q, USER_A, uuid(999)), { ok: false, reason: "not_found" });
});

test("applyResultError maps each failure reason to a user-facing message", () => {
  assert.equal(applyResultError("not_found"), "role not found");
  assert.equal(applyResultError("already_applied"), "Already applied.");
});

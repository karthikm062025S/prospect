import { test } from "node:test";
import assert from "node:assert/strict";
import { applyToRole, applyResultError } from "../lib/apply-role.ts";
import { fakeSupabase, type Row } from "./helpers/fake-supabase.ts";

test("applyToRole scopes the existing link lookup and new link row to the current user", async () => {
  const tables: Record<string, Row[]> = {
    roles_public: [
      {
        id: "role-shared",
        company_id: "company-1",
        title: "Software Engineer Intern",
        link: "https://example.com/role",
        lifecycle: "open",
        jd_snapshot: null,
        jd_snapshot_at: null,
      },
    ],
    user_roles: [
      {
        user_id: "user-b",
        role_id: "role-shared",
        application_id: "application-b",
      },
    ],
    applications: [],
  };

  const result = await applyToRole(fakeSupabase(tables), "user-a", "role-shared");

  assert.equal(result.ok, true);
  assert.equal(tables.applications.length, 1);
  assert.equal(tables.applications[0].user_id, "user-a");
  assert.deepEqual(
    tables.user_roles.map((row) => ({
      user_id: row.user_id,
      role_id: row.role_id,
      application_id: row.application_id,
    })),
    [
      { user_id: "user-b", role_id: "role-shared", application_id: "application-b" },
      { user_id: "user-a", role_id: "role-shared", application_id: "applications-1" },
    ],
  );
});

// L8 audit item 4b: a second confirm on a role the user already linked must
// come back as an explicit reason, never a silent { ok: true } with nothing
// recorded (app/actions.ts confirmAppliedAction / app/role-actions.ts
// markAlreadyAppliedAction both mapped this reason to a no-op before).
test("applyToRole reports already_applied instead of inserting a second application", async () => {
  const tables: Record<string, Row[]> = {
    roles_public: [
      {
        id: "role-1",
        company_id: "company-1",
        title: "Software Engineer Intern",
        link: "https://example.com/role",
        lifecycle: "open",
        jd_snapshot: null,
        jd_snapshot_at: null,
      },
    ],
    user_roles: [],
    applications: [],
  };

  const first = await applyToRole(fakeSupabase(tables), "user-a", "role-1");
  assert.equal(first.ok, true);
  assert.equal(tables.applications.length, 1);

  const second = await applyToRole(fakeSupabase(tables), "user-a", "role-1");
  assert.equal(second.ok, false);
  assert.equal(!second.ok && second.reason, "already_applied");
  // The second call must not have inserted a duplicate application.
  assert.equal(tables.applications.length, 1);
});

test("applyResultError maps each failure reason to a user-facing message", () => {
  assert.equal(applyResultError("not_found"), "role not found");
  assert.equal(applyResultError("already_applied"), "Already applied.");
});

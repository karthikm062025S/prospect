import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeUserRoles } from "../lib/user-roles.ts";

const roles = [
  { id: "r-visible", title: "Visible" },
  { id: "r-saved", title: "Saved" },
  { id: "r-hidden", title: "Hidden" },
  { id: "r-deleted", title: "Deleted" },
  { id: "r-applied", title: "Applied" },
];

test("mergeUserRoles overlays only the current user's state and leaves missing rows idle", () => {
  const result = mergeUserRoles(roles, [
    { role_id: "r-saved", saved_at: "2026-09-02T12:00:00Z", hidden_at: null, apply_clicked_at: null, deleted_at: null, application_id: null },
  ]);

  assert.deepEqual(result.rows.find((row) => row.id === "r-visible"), {
    id: "r-visible",
    title: "Visible",
    saved_at: null,
    hidden_at: null,
    apply_clicked_at: null,
    deleted_at: null,
    application_id: null,
  });
  assert.equal(result.rows.find((row) => row.id === "r-saved")?.saved_at, "2026-09-02T12:00:00Z");
});

test("mergeUserRoles excludes deleted and applied rows, keeps hidden rows for the Hidden chip", () => {
  const result = mergeUserRoles(roles, [
    { role_id: "r-saved", saved_at: "2026-09-02T12:00:00Z", hidden_at: null, apply_clicked_at: null, deleted_at: null, application_id: null },
    { role_id: "r-hidden", saved_at: null, hidden_at: "2026-09-02T12:00:00Z", apply_clicked_at: null, deleted_at: null, application_id: null },
    { role_id: "r-deleted", saved_at: null, hidden_at: null, apply_clicked_at: null, deleted_at: "2026-09-02T12:00:00Z", application_id: null },
    { role_id: "r-applied", saved_at: null, hidden_at: null, apply_clicked_at: null, deleted_at: null, application_id: "a-1" },
  ]);

  assert.deepEqual(result.rows.map((row) => row.id), ["r-visible", "r-saved", "r-hidden"]);
  assert.deepEqual(result.visible.map((row) => row.id), ["r-visible", "r-saved"]);
  assert.deepEqual(result.counts, { all: 2, saved: 1, hidden: 1 });
});

test("mergeUserRoles ignores state for roles outside the shared feed", () => {
  const result = mergeUserRoles(roles.slice(0, 1), [
    { role_id: "r-other", saved_at: "2026-09-02T12:00:00Z", hidden_at: null, apply_clicked_at: null, deleted_at: null, application_id: null },
  ]);

  assert.deepEqual(result.counts, { all: 1, saved: 0, hidden: 0 });
});

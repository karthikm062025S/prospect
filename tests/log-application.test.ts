import { test } from "node:test";
import assert from "node:assert/strict";
import { logApplication } from "../lib/log-application.ts";
import { fakeSupabase } from "./helpers/fake-supabase.ts";

// RB-026 (S7 audit MAJOR 1): logApplication is the ONE insert path for
// applications (the UI apply funnel via applyToRole, the log_application
// MCP tool). Creation IS the first status set, so the insert must stamp
// status_changed_at — the migration only backfilled rows that already
// existed, and isStale() returns false on null, which would make the
// stale badge impossible for every application logged after it.

test("logApplication stamps status_changed_at on the inserted row (injectable clock)", async () => {
  const supabase = fakeSupabase({
    companies: [{ id: "co-1", name: "Roblox", is_watched: true, watch_status: "open" }],
    applications: [],
  });
  const app = await logApplication(supabase, "user-a", { company: "Roblox", role: "SWE Intern" }, "2026-08-24T10:00:00Z");
  assert.equal(app.status_changed_at, "2026-08-24T10:00:00Z");
  const { data } = await supabase.from("applications").select("*");
  const rows = data as Record<string, unknown>[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status_changed_at, "2026-08-24T10:00:00Z");
  assert.equal(rows[0].company_id, "co-1");
  assert.equal(rows[0].user_id, "user-a");
  // the applied-lock flip is unchanged by the stamp
  const { data: companies } = await supabase.from("companies").select("*");
  assert.equal((companies as Record<string, unknown>[])[0].watch_status, "applied_lock");
});

test("logApplication without an explicit clock still stamps a current ISO timestamp", async () => {
  const supabase = fakeSupabase({ companies: [], applications: [] });
  const before = Date.now();
  const app = await logApplication(supabase, "user-a", { company: "New Co", role: "Intern" });
  const stamped = new Date(app.status_changed_at as string).getTime();
  assert.ok(Number.isFinite(stamped) && stamped >= before && stamped <= Date.now(), `got ${app.status_changed_at}`);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { setApplicationStatus, updateApplicationDetails } from "../lib/application-details.ts";
import { fakeSupabase } from "./helpers/fake-supabase.ts";

const UID = "user-a";

test("changes status and stamps status_changed_at for the owner", async () => {
  const supabase = fakeSupabase({
    applications: [{ id: "app-1", user_id: UID, status: "applied", status_changed_at: "2026-08-01T00:00:00Z" }],
  });
  const result = await setApplicationStatus(supabase, UID, "app-1", "oa", "2026-08-23T10:00:00Z");
  assert.deepEqual(result, { ok: true });
  const { data } = await supabase.from("applications").select("*");
  const row = (data as Record<string, unknown>[])[0];
  assert.equal(row.status, "oa");
  assert.equal(row.status_changed_at, "2026-08-23T10:00:00Z");
});

test("same status does not reset status_changed_at", async () => {
  const supabase = fakeSupabase({
    applications: [{ id: "app-1", user_id: UID, status: "applied", status_changed_at: "2026-08-01T00:00:00Z" }],
  });
  const result = await setApplicationStatus(supabase, UID, "app-1", "applied", "2026-08-23T10:00:00Z");
  assert.deepEqual(result, { ok: true });
  const { data } = await supabase.from("applications").select("*");
  assert.equal((data as Record<string, unknown>[])[0].status_changed_at, "2026-08-01T00:00:00Z");
});

test("status writer cannot find another user's application", async () => {
  const supabase = fakeSupabase({
    applications: [{ id: "app-1", user_id: "user-b", status: "applied", status_changed_at: "old" }],
  });
  assert.deepEqual(
    await setApplicationStatus(supabase, UID, "app-1", "offer", "2026-08-23T10:00:00Z"),
    { ok: false, reason: "not_found" },
  );
  const { data } = await supabase.from("applications").select("*");
  assert.equal((data as Record<string, unknown>[])[0].status, "applied");
});

test("detail updates write only allowed fields and never the status clock", async () => {
  const supabase = fakeSupabase({
    applications: [{ id: "app-1", user_id: UID, status: "applied", status_changed_at: "old", notes: null, updated_at: "old" }],
  });
  const result = await updateApplicationDetails(
    supabase,
    UID,
    "app-1",
    { notes: "spoke to recruiter", status: "offer" } as never,
    "2026-08-24T10:00:00Z",
  );
  assert.deepEqual(result, { ok: true });
  const { data } = await supabase.from("applications").select("*");
  const row = (data as Record<string, unknown>[])[0];
  assert.equal(row.notes, "spoke to recruiter");
  assert.equal(row.status, "applied");
  assert.equal(row.status_changed_at, "old");
});

test("detail updates reject malformed dates and empty patches", async () => {
  const supabase = fakeSupabase({ applications: [{ id: "app-1", user_id: UID, follow_up_at: null }] });
  assert.deepEqual(
    await updateApplicationDetails(supabase, UID, "app-1", { follow_up_at: "next tuesday" }, "now"),
    { ok: false, reason: "invalid_date" },
  );
  assert.deepEqual(await updateApplicationDetails(supabase, UID, "app-1", {}, "now"), {
    ok: false,
    reason: "empty_patch",
  });
});

test("detail updates cannot touch another user's application", async () => {
  const supabase = fakeSupabase({ applications: [{ id: "app-1", user_id: "user-b", notes: "private" }] });
  assert.deepEqual(
    await updateApplicationDetails(supabase, UID, "app-1", { notes: "changed" }, "now"),
    { ok: false, reason: "not_found" },
  );
  const { data } = await supabase.from("applications").select("*");
  assert.equal((data as Record<string, unknown>[])[0].notes, "private");
});

// The detail pane's Resume used field is free text (no upload, MISSION.md
// D20): typing saves it, and blanking it must CLEAR the column rather than
// be rejected as an empty patch.
test("resume_file round-trips and an emptied field clears the column", async () => {
  const supabase = fakeSupabase({
    applications: [{ id: "app-1", user_id: UID, status: "applied", status_changed_at: "old", resume_file: null, updated_at: "old" }],
  });
  assert.deepEqual(
    await updateApplicationDetails(supabase, UID, "app-1", { resume_file: "  karthik_mandli_resume_swe  " }, "2026-09-05T10:00:00Z"),
    { ok: true },
  );
  let { data } = await supabase.from("applications").select("*");
  assert.equal((data as Record<string, unknown>[])[0].resume_file, "karthik_mandli_resume_swe");

  assert.deepEqual(
    await updateApplicationDetails(supabase, UID, "app-1", { resume_file: "" }, "2026-09-05T11:00:00Z"),
    { ok: true },
  );
  ({ data } = await supabase.from("applications").select("*"));
  const row = (data as Record<string, unknown>[])[0];
  assert.equal(row.resume_file, null);
  assert.equal(row.status_changed_at, "old");
});

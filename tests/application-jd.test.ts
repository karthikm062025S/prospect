import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchApplicationJd } from "../lib/application-jd.ts";
import { fakeSupabase } from "./helpers/fake-supabase.ts";

const UID = "user-a";

// The read behind getApplicationJdAction (A15): the Applications page payload
// no longer carries jd_snapshot, so the pane fetches exactly the selected
// application's posting — and never throws on a miss.

test("fetchApplicationJd returns the stored snapshot and its capture time", async () => {
  const supabase = fakeSupabase({
    applications: [
      { id: "a1", user_id: UID, jd_snapshot: "<p>the posting</p>", jd_snapshot_at: "2026-08-24T12:00:00Z" },
      { id: "a2", user_id: "user-b", jd_snapshot: "<p>other</p>", jd_snapshot_at: "2026-08-01T12:00:00Z" },
    ],
  });
  const result = await fetchApplicationJd(supabase, UID, "a1");
  assert.deepEqual(result, { html: "<p>the posting</p>", captured_at: "2026-08-24T12:00:00Z" });
});

test("fetchApplicationJd reports 'nothing captured' for an application with no snapshot", async () => {
  const supabase = fakeSupabase({ applications: [{ id: "a1", user_id: UID, jd_snapshot: null, jd_snapshot_at: null }] });
  assert.deepEqual(await fetchApplicationJd(supabase, UID, "a1"), { html: null, captured_at: null });
});

test("fetchApplicationJd returns nulls instead of throwing when the row is gone", async () => {
  const supabase = fakeSupabase({ applications: [] });
  assert.deepEqual(await fetchApplicationJd(supabase, UID, "missing"), { html: null, captured_at: null });
});

test("fetchApplicationJd cannot read another user's snapshot", async () => {
  const supabase = fakeSupabase({
    applications: [{ id: "a1", user_id: "user-b", jd_snapshot: "<p>private</p>", jd_snapshot_at: "now" }],
  });
  assert.deepEqual(await fetchApplicationJd(supabase, UID, "a1"), { html: null, captured_at: null });
});

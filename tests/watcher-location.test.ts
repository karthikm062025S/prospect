import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertRole } from "../lib/upsert-role.ts";
import { fakeSupabase } from "./helpers/fake-supabase.ts";

// D34 (MISSION v5): location flows through the SAME entry point
// app/api/watcher/route.ts calls per role, upsertRole (tests/tombstone-replay.test.ts's
// fake Supabase client). Proves: accepted + stored on insert, backfilled on
// update only when the stored value is null, and never churned once set.

const ROLE = {
  company: "Acme",
  title: "Software Engineer Intern",
  link: "https://acme.example/jobs/1",
  posted_at: "2026-08-01",
};

test("insert stores the posted location", async () => {
  const supabase = fakeSupabase({ companies: [{ id: "co-1", name: "Acme" }], roles: [] });
  const result = await upsertRole(supabase, { ...ROLE, location: "New York, NY" });
  assert.equal(result.action, "insert");
  assert.equal((result.role as { location: string }).location, "New York, NY");
});

test("insert with no location leaves it unset", async () => {
  const supabase = fakeSupabase({ companies: [{ id: "co-1", name: "Acme" }], roles: [] });
  const result = await upsertRole(supabase, { ...ROLE });
  assert.equal((result.role as { location?: string }).location, undefined);
});

test("update backfills location when the stored value is null", async () => {
  const supabase = fakeSupabase({
    companies: [{ id: "co-1", name: "Acme" }],
    roles: [{ id: "r-1", company_id: "co-1", title: ROLE.title, posted_at: ROLE.posted_at, lifecycle: "open", location: null }],
  });
  const result = await upsertRole(supabase, { ...ROLE, location: "Austin, TX" });
  assert.equal(result.action, "update");
  assert.equal((result.role as { location: string }).location, "Austin, TX");
});

test("update never overwrites an already-set location (no churn)", async () => {
  const supabase = fakeSupabase({
    companies: [{ id: "co-1", name: "Acme" }],
    roles: [{ id: "r-1", company_id: "co-1", title: ROLE.title, posted_at: ROLE.posted_at, lifecycle: "open", location: "Seattle, WA" }],
  });
  const result = await upsertRole(supabase, { ...ROLE, location: "Austin, TX" });
  assert.equal(result.action, "update");
  assert.equal((result.role as { location: string }).location, "Seattle, WA");
});

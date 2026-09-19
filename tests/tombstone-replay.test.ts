import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertRole } from "../lib/upsert-role.ts";
import { fakeSupabase } from "./helpers/fake-supabase.ts";

// RB-008: a deleted role is tombstoned by (company_id, title, posted_at) so a
// watcher/MCP replay of the SAME posting can never resurrect it. No existing
// test exercises upsertRole itself (tests/upsert-role.test.ts covers only the
// pure resolveRoleUpsert/isSettableLifecycle/toInsertedRoleEcho helpers) — the
// skip_tombstoned decision lives entirely inside upsertRole's own tombstone
// lookup, before resolveRoleUpsert is ever called, so proving the replay needs
// a real (stubbed) client. The fake client itself now lives in
// tests/helpers/fake-supabase.ts (moved 2026-08-23, s2c-dedup-cycle) so
// tests/dedup-cycle.test.ts (SC-3) can reuse the SAME stub against the SAME
// real upsertRole instead of duplicating it.

// Role shape pulled from tests/fixtures/feeds/simplify.md (Stripe / Software
// Engineer Intern / the real Greenhouse-listing link).
const STRIPE_ROLE = {
  company: "Stripe",
  title: "Software Engineer Intern",
  link: "https://stripe.com/jobs/listing/software-engineer-intern/1234?utm_source=Simplify&ref=Simplify",
};

test("replay: identical re-POST of a tombstoned (company,title,posted_at) triple stays skip_tombstoned", async () => {
  const supabase = fakeSupabase({
    companies: [{ id: "co-1", name: "Stripe" }],
    tombstones: [{ id: "t-1", company_id: "co-1", title: STRIPE_ROLE.title, posted_at: "2026-06-01" }],
    roles: [],
  });
  const result = await upsertRole(supabase, { ...STRIPE_ROLE, posted_at: "2026-06-01" });
  assert.equal(result.action, "skip_tombstoned");
});

test("replay: the null-posted_at variant also stays skip_tombstoned", async () => {
  const supabase = fakeSupabase({
    companies: [{ id: "co-1", name: "Stripe" }],
    tombstones: [{ id: "t-1", company_id: "co-1", title: STRIPE_ROLE.title, posted_at: null }],
    roles: [],
  });
  const result = await upsertRole(supabase, { ...STRIPE_ROLE, posted_at: null });
  assert.equal(result.action, "skip_tombstoned");
});

test("non-matching replay: a different posted_at is NOT caught by the tombstone (dedup-triple semantics)", async () => {
  const supabase = fakeSupabase({
    companies: [{ id: "co-1", name: "Stripe" }],
    tombstones: [{ id: "t-1", company_id: "co-1", title: STRIPE_ROLE.title, posted_at: "2026-06-01" }],
    roles: [],
  });
  const result = await upsertRole(supabase, { ...STRIPE_ROLE, posted_at: "2026-07-01" });
  assert.equal(result.action, "insert");
});

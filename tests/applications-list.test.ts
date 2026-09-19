import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApplicationsList, linkedRoleIds } from "../lib/applications-list.ts";

// RB-025: the Applications left list sorts by date applied (default, newest
// first) or company A-Z, and filters by a text query over company + role
// title. Pure; the client component only renders the result.

const rows = [
  { id: "a", company_name: "Stripe", role: "Software Engineer Intern", date_applied: "2026-08-20" },
  { id: "b", company_name: "anthropic", role: "Research Intern", date_applied: "2026-08-22" },
  { id: "c", company_name: "Roblox", role: "ML Intern", date_applied: "2026-08-22" },
  { id: "d", company_name: "Datadog", role: "SWE Intern", date_applied: "2026-07-01" },
];

test("default sort: date_applied desc; ties keep company A-Z for a stable list", () => {
  assert.deepEqual(
    buildApplicationsList(rows, { sort: "date", query: "" }).map((r) => r.id),
    ["b", "c", "a", "d"],
  );
});

test("company sort: A-Z case-insensitive, then newest first within a company", () => {
  const withDupe = [...rows, { id: "e", company_name: "Stripe", role: "Infra Intern", date_applied: "2026-08-23" }];
  assert.deepEqual(
    buildApplicationsList(withDupe, { sort: "company", query: "" }).map((r) => r.id),
    ["b", "d", "c", "e", "a"],
  );
});

test("query filters over company AND role, case-insensitive substring, trimmed", () => {
  assert.deepEqual(buildApplicationsList(rows, { sort: "date", query: "  intern " }).map((r) => r.id), ["b", "c", "a", "d"]);
  assert.deepEqual(buildApplicationsList(rows, { sort: "date", query: "ML" }).map((r) => r.id), ["c"]);
  assert.deepEqual(buildApplicationsList(rows, { sort: "date", query: "strIPE" }).map((r) => r.id), ["a"]);
  assert.deepEqual(buildApplicationsList(rows, { sort: "date", query: "zzz" }), []);
});

test("does not mutate the input", () => {
  const copy = rows.map((r) => ({ ...r }));
  buildApplicationsList(rows, { sort: "company", query: "" });
  assert.deepEqual(rows, copy);
});

// L8 audit item 4c: the roles_public join must fetch only the ids the
// applications page needs, not the whole shared feed.
test("linkedRoleIds dedupes and drops nulls (an off-app apply has no role_id)", () => {
  assert.deepEqual(
    linkedRoleIds([{ role_id: "r1" }, { role_id: "r2" }, { role_id: "r1" }, { role_id: null }]),
    ["r1", "r2"],
  );
  assert.deepEqual(linkedRoleIds([]), []);
  assert.deepEqual(linkedRoleIds([{ role_id: null }]), []);
});

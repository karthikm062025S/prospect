import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOME_SORTS,
  matchesSearch,
  collapseDuplicates,
  sortRoles,
  groupByCompany,
  buildHomeList,
  relativeDay,
  hydrateHomeRows,
  capHomeGroups,
  HOME_GROUP_CAP,
  type HomeSort,
} from "../lib/sort.ts";
import type { RoleWithCompany } from "../lib/types.ts";

function makeRole(overrides: Partial<RoleWithCompany> = {}): RoleWithCompany {
  return {
    id: "r1",
    company_id: "c1",
    title: "Software Engineer Intern",
    role_type: null,
    lifecycle: "open",
    posted_at: null,
    deadline: null,
    link: null,
    source: null,
    visa_class: null,
    eligible: null,
    eligibility_note: null,
    fit_note: null,
    priority: null,
    application_id: null,
    notes: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    apply_clicked_at: null,
    location: null,
    saved_at: null,
    hidden_at: null,
    jd_snapshot: null,
    jd_snapshot_at: null,
    jd_error: null,
    season: "unspecified",
    family: "other",
    company_name: "Acme",
    ...overrides,
  };
}

// --- HOME_SORTS ---
// D23: the "fit" sort was deleted with lib/fit.ts. D8: "deadline" was deleted
// in favor of "title".
test("HOME_SORTS lists the three surviving sort keys", () => {
  assert.deepEqual(HOME_SORTS, ["recent", "company", "title"]);
});

// --- matchesSearch ---
test("matchesSearch matches on company name case-insensitively", () => {
  assert.equal(matchesSearch({ company_name: "Acme Corp", title: "SWE" }, "acme"), true);
});

test("matchesSearch matches on title case-insensitively", () => {
  assert.equal(matchesSearch({ company_name: "Acme Corp", title: "Software Engineer" }, "SOFTWARE"), true);
});

test("matchesSearch is a substring match, not exact", () => {
  assert.equal(matchesSearch({ company_name: "Acme Corp", title: "SWE" }, "cme"), true);
  assert.equal(matchesSearch({ company_name: "Acme Corp", title: "SWE" }, "zzz"), false);
});

test("matchesSearch: whitespace-only query matches everything", () => {
  assert.equal(matchesSearch({ company_name: "Acme", title: "SWE" }, "   "), true);
  assert.equal(matchesSearch({ company_name: "Acme", title: "SWE" }, ""), true);
});

test("matchesSearch: query with surrounding spaces trims before matching", () => {
  assert.equal(matchesSearch({ company_name: "Acme Corp", title: "SWE" }, "  acme  "), true);
  assert.equal(matchesSearch({ company_name: "Acme Corp", title: "SWE" }, "  zzz  "), false);
});

// --- collapseDuplicates ---
test("collapseDuplicates keeps one row per (company_id, trimmed lowercase title), newest created_at", () => {
  const older = makeRole({ id: "a", company_id: "c1", title: "SWE Intern", created_at: "2026-08-01T00:00:00Z" });
  const newer = makeRole({ id: "b", company_id: "c1", title: " swe intern ", created_at: "2026-08-05T00:00:00Z" });
  const result = collapseDuplicates([older, newer]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b");
});

test("collapseDuplicates preserves input order of survivors", () => {
  const first = makeRole({ id: "a", company_id: "c1", title: "SWE", created_at: "2026-08-01T00:00:00Z" });
  const second = makeRole({ id: "b", company_id: "c2", title: "AI", created_at: "2026-08-02T00:00:00Z" });
  const third = makeRole({ id: "c", company_id: "c1", title: "AI", created_at: "2026-08-03T00:00:00Z" });
  const result = collapseDuplicates([first, second, third]);
  assert.deepEqual(result.map((r) => r.id), ["a", "b", "c"]);
});

test("collapseDuplicates: distinct titles at the same company both survive", () => {
  const a = makeRole({ id: "a", company_id: "c1", title: "SWE Intern" });
  const b = makeRole({ id: "b", company_id: "c1", title: "AI Intern" });
  const result = collapseDuplicates([a, b]);
  assert.equal(result.length, 2);
});

test("collapseDuplicates: empty input", () => {
  assert.deepEqual(collapseDuplicates([]), []);
});

// --- Task 3 T3/T3a: canonical_key-aware grouping (lane L2) ---
test("collapseDuplicates: same company + same canonical_key, DIFFERENT titles, collapse into one", () => {
  const older = makeRole({ id: "a", company_id: "c1", title: "SWE Intern", canonical_key: "wd:R1", created_at: "2026-08-01T00:00:00Z" });
  const newer = makeRole({ id: "b", company_id: "c1", title: "Software Engineer Intern", canonical_key: "wd:R1", created_at: "2026-08-05T00:00:00Z" });
  const result = collapseDuplicates([older, newer]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b");
});

test("collapseDuplicates: DIFFERENT companies sharing the same canonical_key do NOT collapse (tenant-scoped ATS ids)", () => {
  const a = makeRole({ id: "a", company_id: "c1", title: "SWE Intern", canonical_key: "wd:R1" });
  const b = makeRole({ id: "b", company_id: "c2", title: "SWE Intern", canonical_key: "wd:R1" });
  const result = collapseDuplicates([a, b]);
  assert.equal(result.length, 2);
});

test("collapseDuplicates: a null canonical_key still groups by company + normalized title, as today", () => {
  const older = makeRole({ id: "a", company_id: "c1", title: "SWE Intern", canonical_key: null, created_at: "2026-08-01T00:00:00Z" });
  const newer = makeRole({ id: "b", company_id: "c1", title: " swe intern ", canonical_key: null, created_at: "2026-08-05T00:00:00Z" });
  const result = collapseDuplicates([older, newer]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b");
});

// Task 3 done-gate P1-2 fix (2026-09-16): the union mechanic in groupKeys is
// keyed off atsKey, which is null for BOTH a keyless row and a co: fallback
// row — collapsing across those must still happen through the plain base key
// (company + normalized title), unaffected by the ATS-union path.
test("collapseDuplicates: a keyless row collapses with a keyed row sharing the same company + normalized title", () => {
  const keyless = makeRole({ id: "a", company_id: "c1", title: "SWE Intern", canonical_key: null, created_at: "2026-08-01T00:00:00Z" });
  const keyed = makeRole({ id: "b", company_id: "c1", title: "swe intern", canonical_key: "wd:R1", created_at: "2026-08-05T00:00:00Z" });
  const result = collapseDuplicates([keyless, keyed]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "b");
});

// A co: fallback canonical_key is EXCLUDED from the ats-union path (atsKey
// returns null when the key starts with "co:") — a stale co: key shared by
// two rows whose titles have since diverged must never union them; only a
// real ATS id may union across a title drift.
test("collapseDuplicates: a shared co: fallback canonical_key never unions rows with different titles", () => {
  const a = makeRole({ id: "a", company_id: "c1", title: "A", canonical_key: "co:c1|t:stale|l:-" });
  const b = makeRole({ id: "b", company_id: "c1", title: "B", canonical_key: "co:c1|t:stale|l:-" });
  const result = collapseDuplicates([a, b]);
  assert.equal(result.length, 2);
});

test("collapseDuplicates: a group whose hidden (non-winning) member is applied reads applied on the surviving row", () => {
  const applied = makeRole({
    id: "applied-row",
    company_id: "c1",
    title: "SWE Intern",
    canonical_key: "wd:R1",
    created_at: "2026-08-01T00:00:00Z",
    apply_clicked_at: "2026-08-01T12:00:00Z",
  });
  const newer = makeRole({
    id: "newer-row",
    company_id: "c1",
    title: "Software Engineer Intern",
    canonical_key: "wd:R1",
    created_at: "2026-08-05T00:00:00Z",
    apply_clicked_at: null,
  });
  const result = collapseDuplicates([applied, newer]);
  assert.equal(result.length, 1);
  // The visible row stays the newest one (title/id unchanged) ...
  assert.equal(result[0].id, "newer-row");
  assert.equal(result[0].title, "Software Engineer Intern");
  // ... but it now reads as applied.
  assert.equal(result[0].apply_clicked_at, "2026-08-01T12:00:00Z");
});

test("collapseDuplicates: when the winner is already applied, a non-applied sibling never clears it", () => {
  const winnerApplied = makeRole({
    id: "winner",
    company_id: "c1",
    title: "SWE Intern",
    canonical_key: "wd:R1",
    created_at: "2026-08-05T00:00:00Z",
    apply_clicked_at: "2026-08-05T12:00:00Z",
  });
  const older = makeRole({
    id: "older",
    company_id: "c1",
    title: "SWE Intern",
    canonical_key: "wd:R1",
    created_at: "2026-08-01T00:00:00Z",
    apply_clicked_at: null,
  });
  const result = collapseDuplicates([older, winnerApplied]);
  assert.equal(result.length, 1);
  assert.equal(result[0].apply_clicked_at, "2026-08-05T12:00:00Z");
});

test("collapseDuplicates does not mutate input", () => {
  const rows = [
    makeRole({ id: "a", company_id: "c1", title: "SWE", created_at: "2026-08-01T00:00:00Z" }),
    makeRole({ id: "b", company_id: "c1", title: "swe", created_at: "2026-08-02T00:00:00Z" }),
  ];
  const snapshot = JSON.stringify(rows);
  collapseDuplicates(rows);
  assert.equal(JSON.stringify(rows), snapshot);
});

// --- sortRoles ---
test("sortRoles 'recent' orders by created_at desc", () => {
  const a = makeRole({ id: "a", created_at: "2026-08-01T00:00:00Z" });
  const b = makeRole({ id: "b", created_at: "2026-08-10T00:00:00Z" });
  const result = sortRoles([a, b], "recent");
  assert.deepEqual(result.map((r) => r.id), ["b", "a"]);
});

test("sortRoles 'title' orders by title case-insensitively, tie breaks by recent", () => {
  const zeta = makeRole({ id: "zeta", title: "Zeta Engineer", created_at: "2026-08-01T00:00:00Z" });
  const alpha = makeRole({ id: "alpha", title: "alpha Engineer", created_at: "2026-08-01T00:00:00Z" });
  const result = sortRoles([zeta, alpha], "title");
  assert.deepEqual(result.map((r) => r.id), ["alpha", "zeta"]);
});

test("sortRoles 'title' tie-break on equal title (case-insensitive) falls back to recent", () => {
  const a = makeRole({ id: "a", title: "Software Engineer", created_at: "2026-08-01T00:00:00Z" });
  const b = makeRole({ id: "b", title: "software engineer", created_at: "2026-08-10T00:00:00Z" });
  const result = sortRoles([a, b], "title");
  assert.deepEqual(result.map((r) => r.id), ["b", "a"]);
});

test("sortRoles 'company' orders by company_name localeCompare asc, tie breaks by recent", () => {
  const zeta = makeRole({ id: "zeta", company_name: "Zeta Corp", created_at: "2026-08-01T00:00:00Z" });
  const alpha = makeRole({ id: "alpha", company_name: "Alpha Inc", created_at: "2026-08-01T00:00:00Z" });
  const result = sortRoles([zeta, alpha], "company");
  assert.deepEqual(result.map((r) => r.id), ["alpha", "zeta"]);
});

test("sortRoles 'company' tie-break on equal company_name falls back to recent", () => {
  const a = makeRole({ id: "a", company_name: "Acme", created_at: "2026-08-01T00:00:00Z" });
  const b = makeRole({ id: "b", company_name: "Acme", created_at: "2026-08-10T00:00:00Z" });
  const result = sortRoles([a, b], "company");
  assert.deepEqual(result.map((r) => r.id), ["b", "a"]);
});

test("sortRoles never mutates the input array", () => {
  const a = makeRole({ id: "a", created_at: "2026-08-01T00:00:00Z" });
  const b = makeRole({ id: "b", created_at: "2026-08-10T00:00:00Z" });
  const input = [a, b];
  const result = sortRoles(input, "recent");
  assert.deepEqual(input.map((r) => r.id), ["a", "b"]);
  assert.notEqual(result, input);
});

test("sortRoles handles empty input for every sort key", () => {
  for (const sort of HOME_SORTS) {
    assert.deepEqual(sortRoles([], sort), []);
  }
});

// --- groupByCompany ---
test("groupByCompany: one group per company, first-appearance order", () => {
  const a = makeRole({ id: "a", company_id: "c1", company_name: "Acme" });
  const b = makeRole({ id: "b", company_id: "c2", company_name: "Beta" });
  const c = makeRole({ id: "c", company_id: "c1", company_name: "Acme" });
  const groups = groupByCompany([a, b, c]);
  assert.deepEqual(
    groups.map((g) => g.company_id),
    ["c1", "c2"],
  );
  assert.deepEqual(
    groups[0].roles.map((r) => r.id),
    ["a", "c"],
  );
  assert.deepEqual(
    groups[1].roles.map((r) => r.id),
    ["b"],
  );
});

test("groupByCompany: a company with one role is a one-role group", () => {
  const a = makeRole({ id: "a", company_id: "c1" });
  const groups = groupByCompany([a]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].roles.length, 1);
});

test("groupByCompany: empty input yields empty groups", () => {
  assert.deepEqual(groupByCompany([]), []);
});

// --- buildHomeList ---
test("buildHomeList composes search -> collapse -> sort -> group", () => {
  const match = makeRole({
    id: "match",
    company_id: "c1",
    company_name: "Acme",
    title: "Software Engineer",
    created_at: "2026-08-10T00:00:00Z",
  });
  const noMatch = makeRole({
    id: "nomatch",
    company_id: "c2",
    company_name: "Beta",
    title: "Data Scientist",
    created_at: "2026-08-11T00:00:00Z",
  });
  const dupOlder = makeRole({
    id: "dup-older",
    company_id: "c1",
    company_name: "Acme",
    title: "software engineer",
    created_at: "2026-08-01T00:00:00Z",
  });
  const groups = buildHomeList([match, noMatch, dupOlder], { sort: "recent", query: "acme" });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].company_id, "c1");
  assert.deepEqual(
    groups[0].roles.map((r) => r.id),
    ["match"],
  );
});

test("buildHomeList: canonical_key collapses same-company different-title duplicates into one group", () => {
  const older = makeRole({ id: "a", company_id: "c1", company_name: "Acme", title: "SWE Intern", canonical_key: "wd:R1", created_at: "2026-08-01T00:00:00Z" });
  const newer = makeRole({ id: "b", company_id: "c1", company_name: "Acme", title: "Software Engineer Intern", canonical_key: "wd:R1", created_at: "2026-08-05T00:00:00Z" });
  const groups = buildHomeList([older, newer], { sort: "recent", query: "" });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].roles.length, 1);
  assert.equal(groups[0].roles[0].id, "b");
});

test("buildHomeList: empty input returns empty groups", () => {
  assert.deepEqual(buildHomeList([], { sort: "recent", query: "" }), []);
});

test("HomeSort type accepts each declared key (compile-time smoke test)", () => {
  const sorts: HomeSort[] = ["recent", "company", "title"];
  assert.equal(sorts.length, 3);
});

// --- relativeDay (D28) ---
// The label is computed in America/New_York calendar days — ONE fixed zone, so
// the server (UTC) and the browser (ET) render the same string. Fixtures are
// UTC instants, deliberately including ones that straddle midnight ET vs UTC.
const NOON = new Date("2026-08-24T16:00:00Z").getTime(); // 12:00 ET, Aug 24

test("relativeDay: the same NY calendar day is 'today'", () => {
  assert.equal(relativeDay("2026-08-24T04:00:00Z", NOON), "Today"); // 00:00 ET
  assert.equal(relativeDay("2026-08-25T03:59:00Z", NOON), "Today"); // 23:59 ET
});

test("relativeDay: the previous NY calendar day is 'yesterday', not a 24h bucket", () => {
  assert.equal(relativeDay("2026-08-24T03:59:00Z", NOON), "Yesterday"); // 23:59 ET Aug 23
  assert.equal(relativeDay("2026-08-23T04:00:00Z", NOON), "Yesterday"); // 00:00 ET Aug 23
});

// The hydration bug this replaced: an instant that is one UTC day but a
// DIFFERENT NY day. 01:30Z on Aug 24 is 21:30 ET on Aug 23, so a server
// rendering in UTC said "today" while the ET browser said "yesterday".
test("relativeDay: an evening-ET instant reads the same on a UTC server and an ET client", () => {
  const evening = "2026-08-24T01:30:00Z"; // Aug 23, 21:30 ET
  assert.equal(relativeDay(evening, new Date("2026-08-24T02:00:00Z").getTime()), "Today");
  assert.equal(relativeDay(evening, new Date("2026-08-24T05:00:00Z").getTime()), "Yesterday");
});

test("relativeDay: 2-6 days back read as Nd ago", () => {
  assert.equal(relativeDay("2026-08-22T16:00:00Z", NOON), "2d ago");
  assert.equal(relativeDay("2026-08-18T16:00:00Z", NOON), "6d ago");
});

test("relativeDay: a week or more reads as Nw ago", () => {
  assert.equal(relativeDay("2026-08-17T16:00:00Z", NOON), "1w ago");
  assert.equal(relativeDay("2026-08-11T16:00:00Z", NOON), "1w ago");
  assert.equal(relativeDay("2026-08-10T16:00:00Z", NOON), "2w ago");
});

test("relativeDay: a future timestamp degrades to 'today', never a negative count", () => {
  assert.equal(relativeDay("2026-08-26T16:00:00Z", NOON), "Today");
});

test("relativeDay: an unparseable timestamp renders the placeholder", () => {
  assert.equal(relativeDay("not a date", NOON), "Not recorded");
});

// --- A15 payload diet: hydrateHomeRows + capHomeGroups ---
test("hydrateHomeRows rebuilds the four company fields from the map", () => {
  const [row] = hydrateHomeRows(
    [{ id: "r1", company_id: "c1", href: "https://acme.example/jobs/1" }],
    { c1: { name: "Acme", tier: "Big Tech", url: "https://acme.example", visa_note: "no sponsorship" } },
  );
  assert.equal(row.company_name, "Acme");
  assert.equal(row.company_tier, "Big Tech");
  assert.equal(row.company_url, "https://acme.example");
  assert.equal(row.company_visa_note, "no sponsorship");
  // The server already sanitized this — hydration must pass it through as-is.
  assert.equal(row.href, "https://acme.example/jobs/1");
});

test("hydrateHomeRows falls back to the company_id when the company is missing", () => {
  const [row] = hydrateHomeRows([{ id: "r1", company_id: "c9", href: null }], {});
  assert.equal(row.company_name, "c9");
  assert.equal(row.company_tier, null);
  assert.equal(row.company_url, null);
  assert.equal(row.company_visa_note, null);
  // A role the server found no safe posting URL for stays href-less.
  assert.equal(row.href, null);
});

function capGroup(i: number, armed = false) {
  return {
    company_id: `c${i}`,
    company_name: `Co ${i}`,
    roles: [{ ...makeRole({ id: `r${i}`, company_id: `c${i}` }), apply_clicked_at: armed ? "2026-08-25T00:00:00Z" : null }],
  };
}

test("capHomeGroups renders at most HOME_GROUP_CAP groups, and all of them once expanded", () => {
  const groups = Array.from({ length: HOME_GROUP_CAP + 25 }, (_, i) => capGroup(i));
  assert.equal(capHomeGroups(groups, false).length, HOME_GROUP_CAP);
  assert.equal(capHomeGroups(groups, true).length, HOME_GROUP_CAP + 25);
  assert.equal(capHomeGroups(groups.slice(0, HOME_GROUP_CAP), false).length, HOME_GROUP_CAP);
});

test("capHomeGroups never hides an armed Applied? confirmation behind the cap (RB-013)", () => {
  const groups = Array.from({ length: HOME_GROUP_CAP + 25 }, (_, i) => capGroup(i, i === HOME_GROUP_CAP + 10));
  const shown = capHomeGroups(groups, false);
  assert.equal(shown.length, HOME_GROUP_CAP + 1);
  assert.equal(shown[HOME_GROUP_CAP].company_id, `c${HOME_GROUP_CAP + 10}`);
});

// --- v7/feed lane, 2026-09-03. Karthik: "sort perfectly". The Home sort key is
// created_at (NOT NULL), never posted_at (NULL on 699 of 1,276 live rows) — so a
// null posted_at can never reorder anything. These lock stability on ties.
const tie = (id: string, company: string) => ({
  id,
  company_id: "c",
  company_name: company,
  title: id,
  created_at: "2026-09-03T12:00:00Z",
  deadline: null,
});

test("sortRoles 'recent' is stable when created_at ties (input order preserved)", () => {
  const rows = [tie("a", "Acme"), tie("b", "Acme"), tie("c", "Acme"), tie("d", "Acme")];
  assert.deepEqual(
    sortRoles(rows, "recent").map((r) => r.id),
    ["a", "b", "c", "d"],
  );
  // and re-sorting an already sorted list is a fixed point
  assert.deepEqual(
    sortRoles(sortRoles(rows, "recent"), "recent").map((r) => r.id),
    ["a", "b", "c", "d"],
  );
});

test("a posted_at column is not a sort input at all (rows differing only by posted_at keep input order)", () => {
  const rows = [
    { ...tie("older-post", "Acme"), posted_at: "2020-01-01" },
    { ...tie("no-post", "Acme"), posted_at: null },
    { ...tie("newer-post", "Acme"), posted_at: "2026-09-01" },
  ];
  assert.deepEqual(
    sortRoles(rows, "recent").map((r) => r.id),
    ["older-post", "no-post", "newer-post"],
  );
});

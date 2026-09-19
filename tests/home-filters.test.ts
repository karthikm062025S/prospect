import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilters, filterCounts } from "../lib/home-filters.ts";

const rows = [
  { id: "summer-swe", season: "summer_2027", families: ["swe"] },
  { id: "summer-data", season: "summer_2027", families: ["data"] },
  { id: "fall-swe", season: "fall_2027", families: ["swe"] },
  { id: "spring-ai", season: "spring_2028", families: ["ai_ml"] },
  { id: "coop-swe", season: "coop", families: ["swe"] },
  { id: "unspecified-other", season: "unspecified", families: ["other"] },
] as const;

test("applyFilters keeps every row when both filters use the All default", () => {
  assert.deepEqual(
    applyFilters(rows, { season: "all", family: "all" }).map((row) => row.id),
    rows.map((row) => row.id),
  );
});

test("applyFilters applies either filter independently", () => {
  assert.deepEqual(
    applyFilters(rows, { season: "summer_2027", family: "all" }).map((row) => row.id),
    ["summer-swe", "summer-data"],
  );
  assert.deepEqual(
    applyFilters(rows, { season: "all", family: "swe" }).map((row) => row.id),
    ["summer-swe", "fall-swe", "coop-swe"],
  );
});

test("applyFilters intersects season and role-family selections", () => {
  assert.deepEqual(
    applyFilters(rows, { season: "summer_2027", family: "data" }).map((row) => row.id),
    ["summer-data"],
  );
  assert.deepEqual(applyFilters(rows, { season: "fall_2027", family: "data" }), []);
});

test("applyFilters does not mutate its input", () => {
  const before = JSON.stringify(rows);
  applyFilters(rows, { season: "summer_2027", family: "swe" });
  assert.equal(JSON.stringify(rows), before);
});

test("filterCounts reports each season under the current family", () => {
  const counts = filterCounts(rows, { season: "all", family: "swe" });

  assert.deepEqual(counts.season, {
    all: 3,
    summer_2027: 1,
    fall_2027: 1,
    coop: 1,
  });
});

test("filterCounts reports each role family under the current season", () => {
  const counts = filterCounts(rows, { season: "summer_2027", family: "all" });

  assert.deepEqual(counts.family, {
    all: 2,
    swe: 1,
    data: 1,
  });
});

test("filterCounts measures each side under only the other active filter", () => {
  const counts = filterCounts(rows, { season: "summer_2027", family: "data" });

  assert.deepEqual(counts.season, {
    all: 1,
    summer_2027: 1,
  });
  assert.deepEqual(counts.family, {
    all: 2,
    swe: 1,
    data: 1,
  });
});

test("filterCounts returns zero All counts for an empty input", () => {
  assert.deepEqual(filterCounts([], { season: "all", family: "all" }), {
    season: { all: 0 },
    family: { all: 0 },
  });
});

// --- Task 2 / D3-D4 (lane L1, 2026-09-15): a role can be two families at
// once (e.g. "SDE Intern, Alexa AI" is both ai_ml and swe). A row with
// families ["ai_ml","swe"] must show under EITHER pill, and count once per
// family it carries, while the "all" bucket still counts the row once.
test("a multi-family row is returned for every one of its families", () => {
  const multiRows = [{ id: "multi", season: "summer_2027", families: ["ai_ml", "swe"] }] as const;
  assert.deepEqual(
    applyFilters(multiRows, { season: "all", family: "swe" }).map((row) => row.id),
    ["multi"],
  );
  assert.deepEqual(
    applyFilters(multiRows, { season: "all", family: "ai_ml" }).map((row) => row.id),
    ["multi"],
  );
});

test("filterCounts counts a multi-family row once per family and once in all", () => {
  const multiRows = [{ id: "multi", season: "summer_2027", families: ["ai_ml", "swe"] }] as const;
  const counts = filterCounts(multiRows, { season: "all", family: "all" });
  assert.equal(counts.family.swe, 1);
  assert.equal(counts.family.ai_ml, 1);
  assert.equal(counts.family.all, 1);
});

test('a row with families ["other"] is not returned for swe', () => {
  const otherRows = [{ id: "o", season: "summer_2027", families: ["other"] }] as const;
  assert.deepEqual(applyFilters(otherRows, { season: "all", family: "swe" }), []);
});

// --- v7/feed lane, 2026-09-03: the invariant Karthik asked to be proven, not
// assumed — "the Home season/role pill counts must equal the rows shown".
// components/home-list.tsx renders applyFilters(viewRows, {season, family}) and
// labels the pills with filterCounts(viewRows, {season, family}), so for EVERY
// (season, family) pair the selected pill's count must equal the row count.
const INVARIANT_ROWS = [
  { id: "a", season: "summer_2027", families: ["swe"] },
  { id: "b", season: "summer_2027", families: ["swe"] },
  { id: "c", season: "summer_2027", families: ["data"] },
  { id: "d", season: "fall_2027", families: ["swe"] },
  { id: "e", season: "fall_2027", families: ["ai_ml"] },
  { id: "f", season: "coop", families: ["quant"] },
  { id: "g", season: "unspecified", families: ["security"] },
  { id: "h", season: "spring_2028", families: ["product"] },
  // A row whose family the DB never stored (roles.family is nullable and 15
  // live rows carry NULL). app/(app)/page.tsx now derives it so this can never
  // be an unreachable row, but the counter must stay consistent regardless.
  { id: "i", season: "summer_2028", families: ["other"] },
];
const SEASON_KEYS = ["all", "summer_2027", "fall_2027", "spring_2028", "summer_2028", "coop", "unspecified"];
const FAMILY_KEYS = ["all", "swe", "ai_ml", "data", "quant", "product", "security", "hardware", "design", "other"];

test("pill counts equal the rows shown, for every (season, family) pair", () => {
  for (const season of SEASON_KEYS) {
    for (const family of FAMILY_KEYS) {
      const shown = applyFilters(INVARIANT_ROWS, { season, family });
      const counts = filterCounts(INVARIANT_ROWS, { season, family });
      assert.equal(
        counts.season[season] ?? 0,
        shown.length,
        `season pill "${season}" count != rows shown under family "${family}"`,
      );
      assert.equal(
        counts.family[family] ?? 0,
        shown.length,
        `family pill "${family}" count != rows shown under season "${season}"`,
      );
    }
  }
});

test("the counted rows are exactly the shown rows, not just the same length", () => {
  const shown = applyFilters(INVARIANT_ROWS, { season: "summer_2027", family: "swe" });
  assert.deepEqual(
    shown.map((r) => r.id),
    ["a", "b"],
  );
});

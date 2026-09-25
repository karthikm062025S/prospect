import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSeason, SEASON_LABEL, SEASON_ORDER, seasonChipItems } from "../lib/season.ts";
import type { Season } from "../lib/season.ts";

// Pure title (+ optional posting text) -> Season
// classifier. Cases below cover every rule branch, in the order the function
// applies them (explicit season+supported-year, explicit season+unsupported-
// year, winter, co-op, bare season word, bare year, text fallback).

const TITLE_CASES: Array<[string, ReturnType<typeof deriveSeason>]> = [
  // explicit season + supported year, several formats
  ["Software Engineer Intern - Summer 2027 (Remote)", "summer_2027"],
  ["Software Engineer Intern (Summer 2027)", "summer_2027"],
  ["SWE Intern - Summer '27", "summer_2027"],
  ["Su27 Software Engineering Intern", "summer_2027"],
  ["Fall 2027 Co-op", "fall_2027"],
  ["Fall 2027 Software Engineering Intern", "fall_2027"],
  ["Autumn 2027 Software Engineer Intern", "fall_2027"],
  ["AI Research Intern, Fall '27", "fall_2027"],
  ["Spring 2028 Software Engineering Intern", "spring_2028"],
  ["Product Manager Intern, Spring '28", "spring_2028"],
  ["Summer 2028 Software Engineering Intern", "summer_2028"],
  ["Software Engineer Intern - Su'28", "summer_2028"],
  // explicit season word directly attached to an unsupported year -> unspecified,
  // never silently rounded to the nearest supported year
  ["Summer 2026 Intern", "unspecified"], // must NOT map to 2027
  ["Software Engineer Intern - Fall 2026", "unspecified"],
  // winter has no enum value at all, with or without a year
  ["Winter 2027 Intern", "unspecified"],
  ["Winter Software Engineering Intern", "unspecified"],
  // explicit season beats a co-op word in the same title
  ["Software Engineering Co-op - Fall 2027", "fall_2027"],
  // co-op with no explicit season word
  ["Co-op Software Engineer", "coop"],
  ["Cooperative Education Program - Software Engineer", "coop"],
  // bare season word, no year -> nearest upcoming instance we track
  ["Fall Software Engineering Intern", "fall_2027"],
  ["Spring Software Engineering Intern", "spring_2028"],
  ["Summer Software Engineering Intern", "summer_2027"],
  // ambiguous multi-season title: the season with a year directly attached wins
  ["Spring/Summer 2028 Intern", "summer_2028"],
  // bare year + "intern", no season word -> summer is the dominant term
  ["2027 SWE Internship", "summer_2027"],
  ["Internship, Class of 2027", "summer_2027"],
  // nothing at all to go on
  ["Software Engineer Intern", "unspecified"],
];

for (const [title, expected] of TITLE_CASES) {
  test(`deriveSeason(${JSON.stringify(title)}) -> ${expected}`, () => {
    assert.equal(deriveSeason(title), expected);
  });
}

test("falls through to posting text when the title is unspecified", () => {
  assert.equal(
    deriveSeason("Software Engineer Intern", "This role starts Summer 2027."),
    "summer_2027",
  );
});

test("null/undefined text is treated as absent, title result stands", () => {
  assert.equal(deriveSeason("Fall 2027 Software Engineer Intern", null), "fall_2027");
  assert.equal(deriveSeason("Software Engineer Intern", undefined), "unspecified");
});

test("SEASON_ORDER contains exactly the SEASON_LABEL keys, once each", () => {
  const labelKeys = Object.keys(SEASON_LABEL).sort();
  const orderKeys = [...SEASON_ORDER].sort();
  assert.deepEqual(orderKeys, labelKeys);
});

// v7 S4 LANDING-FLOW. The landing's season pills used to be derived from the
// 24 rows it happened to draw, so on the live open set (below) it offered
// exactly "All 24 / Unspecified 24" and a student looking for Summer 2027 saw
// a filter with nothing in it. The fixture is the real 2026-09-03 distribution
// of the 1,293 open roles.
const OPEN_ROLE_COUNTS: Partial<Record<Season, number>> = {
  summer_2027: 405,
  coop: 32,
  unspecified: 856,
};

test("season chips: only terms with an open role, counted over the whole open set", () => {
  assert.deepEqual(seasonChipItems(OPEN_ROLE_COUNTS), [
    { key: "all", label: "All", count: 1293 },
    { key: "summer_2027", label: "Summer 2027", count: 405 },
    { key: "coop", label: "Co-op", count: 32 },
    { key: "unspecified", label: "Term not stated", count: 856 },
  ]);
});

test("season chips: a term with zero open roles never becomes an option", () => {
  const keys = seasonChipItems(OPEN_ROLE_COUNTS).map((item) => item.key);
  assert.equal(keys.includes("fall_2027"), false);
  assert.equal(keys.includes("spring_2028"), false);
  assert.equal(keys.includes("summer_2028"), false);
  // An explicit zero is the same as absent.
  assert.deepEqual(
    seasonChipItems({ summer_2027: 3, fall_2027: 0 }).map((item) => item.key),
    ["all", "summer_2027"],
  );
});

test("season chips: options follow SEASON_ORDER, and All totals them", () => {
  const items = seasonChipItems({ unspecified: 1, summer_2028: 2, summer_2027: 4 });
  assert.deepEqual(
    items.map((item) => item.key),
    ["all", "summer_2027", "summer_2028", "unspecified"],
  );
  assert.equal(items[0].count, 7);
});

test("season chips: no open roles at all leaves one dead-but-honest All chip", () => {
  assert.deepEqual(seasonChipItems({}), [{ key: "all", label: "All", count: 0 }]);
});

test("the unspecified pill says what it means in plain words", () => {
  assert.equal(SEASON_LABEL.unspecified, "Term not stated");
});

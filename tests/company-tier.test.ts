import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveTierTags, TIER_LABEL, TIER_ORDER } from "../lib/company-tier.ts";

// VTHacks speed pass (2026-09-20): "I want to see big 4 as a filter"
// (Karthik). Pure companyName + storedTier -> dream-tier tags, several at
// once, [] when nothing matches.

test("big 4 accounting firms", () => {
  assert.deepEqual(deriveTierTags("Deloitte", null), ["big4"]);
  assert.deepEqual(deriveTierTags("PricewaterhouseCoopers", null), ["big4"]);
  assert.deepEqual(deriveTierTags("KPMG", null), ["big4"]);
  assert.deepEqual(deriveTierTags("Ernst & Young", null), ["big4"]);
});

test("consulting firms", () => {
  assert.deepEqual(deriveTierTags("McKinsey & Company", null), ["mbb_consulting"]);
  assert.deepEqual(deriveTierTags("Boston Consulting Group", null), ["mbb_consulting"]);
  assert.deepEqual(deriveTierTags("Bain & Company", null), ["mbb_consulting"]);
  assert.deepEqual(deriveTierTags("Accenture", null), ["mbb_consulting"]);
});

test("big tech, by name or by stored tier", () => {
  assert.deepEqual(deriveTierTags("Google", null), ["big_tech"]);
  assert.deepEqual(deriveTierTags("Meta", null), ["big_tech"]);
  assert.deepEqual(deriveTierTags("Some Startup Inc", "Big Tech"), ["big_tech"]);
});

test("banks and finance, by name or by stored tier", () => {
  assert.deepEqual(deriveTierTags("JPMorgan Chase", null), ["finance"]);
  assert.deepEqual(deriveTierTags("Goldman Sachs", null), ["finance"]);
  assert.deepEqual(deriveTierTags("Random Regional Bank", "Fintech / Banks / Quant"), ["finance"]);
});

test("government, by name or by stored tier", () => {
  assert.deepEqual(deriveTierTags("NASA", null), ["government"]);
  assert.deepEqual(deriveTierTags("Department of Defense", null), ["government"]);
  assert.deepEqual(deriveTierTags("Fairfax County Government", null), ["government"]);
});

test("startups, by stored tier only (no name signal)", () => {
  assert.deepEqual(deriveTierTags("Acme Robotics", "High-Growth Tech"), ["startup"]);
  assert.deepEqual(deriveTierTags("Acme Robotics", "AI & Frontier"), ["startup"]);
});

test("no match returns an empty array", () => {
  assert.deepEqual(deriveTierTags("Random Regional Manufacturer", null), []);
  assert.deepEqual(deriveTierTags("Random Regional Manufacturer", "Other"), []);
});

test("a company can carry several tags at once", () => {
  assert.deepEqual(deriveTierTags("Accenture Federal Services", null), ["mbb_consulting", "government"]);
});

test("TIER_ORDER contains exactly the TIER_LABEL keys, once each", () => {
  const labelKeys = Object.keys(TIER_LABEL).sort();
  const orderKeys = [...TIER_ORDER].sort();
  assert.deepEqual(orderKeys, labelKeys);
});

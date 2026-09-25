import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterTier } from "../lib/scan-tier.ts";

// /api/scan's pure half: the tier split over the REAL data files.

const here = new URL(".", import.meta.url);
const endpoints = JSON.parse(readFileSync(new URL("../scripts/endpoints.json", here), "utf8"));
const targets = JSON.parse(readFileSync(new URL("../scripts/targets.json", here), "utf8"));

test("hot tier over the real endpoints.json / targets.json is the spike-5 measured 232 of 999", () => {
  assert.equal(endpoints.length, 999);
  assert.equal(filterTier(endpoints, targets, "hot").length, 232);
  assert.equal(filterTier(endpoints, targets, "full").length, 999);
});

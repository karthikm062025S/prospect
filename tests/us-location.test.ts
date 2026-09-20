import { test } from "node:test";
import assert from "node:assert/strict";
import { isUsLocation } from "../lib/us-location.ts";

// VTHacks speed pass (2026-09-20): "change the location to only united
// states" (Karthik). A TypeScript port of `looksUS` in scripts/scan-core.mjs,
// location-text-only (no countryHint at read time).

test("isUsLocation", () => {
  assert.equal(isUsLocation(null), true); // blank -> keep
  assert.equal(isUsLocation("3 Locations"), true); // ambiguous -> keep
  assert.equal(isUsLocation("Bangalore, India"), false);
  assert.equal(isUsLocation("London, United Kingdom"), false);
  assert.equal(isUsLocation("Toronto, ON, Canada"), false);
  assert.equal(isUsLocation("Remote"), true);
  assert.equal(isUsLocation("Boise, ID - Main Site"), true);
  assert.equal(isUsLocation("New York, NEW YORK, United States"), true);
  assert.equal(isUsLocation("Dublin"), false); // NON_US_COUNTRY lists Dublin (mirrors scan-core.mjs)
});

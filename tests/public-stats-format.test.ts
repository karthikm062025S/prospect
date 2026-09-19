import { test } from "node:test";
import assert from "node:assert/strict";
import { formatStat, roundToTen } from "../lib/public-stats-format.ts";

test("a missing count renders n/a, never 0", () => {
  assert.equal(formatStat(null), "n/a");
  assert.equal(formatStat(undefined), "n/a");
  assert.equal(formatStat(Number.NaN), "n/a");
  assert.equal(formatStat(0), "0");
});

test("exact counts get thousands separators", () => {
  assert.equal(formatStat(999), "999");
  assert.equal(formatStat(1481), "1,481");
});

test("approx rounds to the nearest ten and prefixes a tilde", () => {
  assert.equal(roundToTen(999), 1000);
  assert.equal(roundToTen(994), 990);
  assert.equal(formatStat(999, true), "~1,000");
  assert.equal(formatStat(994, true), "~990");
});

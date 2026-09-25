import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-level structural assertions -- the codebase's existing convention
// for .tsx UI (tests/correction-control.test.ts, tests/dialog-a11y.test.ts):
// node --experimental-strip-types --test refuses the .tsx extension outright
// (ERR_UNKNOWN_FILE_EXTENSION), so a component's logic is proven by reading
// its real source rather than importing it.
const source = readFileSync(new URL("../components/labels-bar.tsx", import.meta.url), "utf8");

test("labels-bar.tsx: the unmapped state (counts === null) has its own named line", () => {
  assert.match(source, /counts === null/);
  assert.match(source, /not mapped to O\*NET tasks yet/);
});

test("labels-bar.tsx: the not-measured state (mapped, no exposure data) has its own named line", () => {
  assert.match(source, /measured === 0/);
  assert.match(source, /mapped, but none have exposure data yet/);
});

test("labels-bar.tsx: the measured state renders the exact 'N Human-led · N AI-assisted · N Automatable' template", () => {
  assert.match(
    source,
    /\$\{counts\.human_led\} Human-led .*\$\{counts\.ai_assisted\} AI-assisted .*\$\{counts\.automatable\} Automatable/,
  );
});

test("labels-bar.tsx: a remaining unscored count is named, never silently dropped", () => {
  assert.match(source, /counts\.unscored > 0/);
  assert.match(source, /not yet measured/);
});

test("labels-bar.tsx: never invents a percentage -- the coverage text cites the real 2,450 / 18,838 counts", () => {
  assert.match(source, /2,450 of 18,838 O\*NET tasks have exposure data \(13%\)/);
});

test("labels-bar.tsx: the coverage note is a native disclosure (no custom popover library)", () => {
  assert.match(source, /<details/);
  assert.match(source, /<summary/);
});

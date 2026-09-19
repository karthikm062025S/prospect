import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// DX6 (mission v6, V5): the confirm cluster must wrap to its own line instead
// of overlapping the row. String checks stand in for a DOM/bounding-rect
// assertion — no DOM lib is installed in this project.
const src = readFileSync(new URL("../components/role-row.tsx", import.meta.url), "utf8");

test("row container allows wrapping so the confirm cluster can't overlap", () => {
  assert.match(src, /flex flex-wrap items-center gap-x-2 border-l-2/);
});

test("confirming cluster takes its own right-aligned line, wrapping only when it doesn't fit", () => {
  assert.match(src, /basis-full flex-wrap justify-end/);
  assert.match(src, /md:basis-auto md:ml-auto/);
});

// v6 L3 B: the posting pane must not nest a scroller inside a column that
// already scrolls.
test("the role pane's posting is not a nested scroll box", () => {
  const pane = readFileSync(new URL("../components/role-detail-pane.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(pane, /max-h-\[46vh\]/);
});

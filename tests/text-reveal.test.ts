import { test } from "node:test";
import assert from "node:assert/strict";
import {
  revealedCount,
  splitUnits,
  unitRange,
} from "../components/motion/reveal-math.ts";

test("splitUnits keeps words whole at word granularity", () => {
  assert.deepEqual(
    splitUnits("apply early now", "word").map((u) => u.text),
    ["apply", "early", "now"],
  );
  assert.deepEqual(
    splitUnits("apply early now", "word").map((u) => u.lead),
    ["", " ", " "],
  );
});

test("splitUnits emits one unit per character and carries the space as lead", () => {
  const units = splitUnits("ab cd", "char");
  assert.deepEqual(
    units.map((u) => u.text),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    units.map((u) => u.lead),
    ["", "", " ", ""],
  );
});

test("splitUnits collapses runs of whitespace so no unit is empty", () => {
  const units = splitUnits("  a   b  ", "word");
  assert.deepEqual(
    units.map((u) => u.text),
    ["a", "b"],
  );
});

test("revealedCount clamps outside 0..1 and holds its end state", () => {
  assert.equal(revealedCount(-3, 10, "char"), 0);
  assert.equal(revealedCount(0, 10, "char"), 0);
  assert.equal(revealedCount(1, 10, "char"), 10);
  assert.equal(revealedCount(4.2, 10, "char"), 10);
  assert.equal(revealedCount(Number.NaN, 10, "char"), 0);
});

test("revealedCount never exceeds the unit count", () => {
  for (let step = 0; step <= 20; step += 1) {
    const count = revealedCount(step / 20, 7, "word");
    assert.ok(count >= 0 && count <= 7, `count ${count} out of range`);
  }
});

test("char granularity sweeps: a unit counts only once fully passed", () => {
  // 4 units, so each owns a quarter of the range.
  assert.equal(revealedCount(0.24, 4, "char"), 0);
  assert.equal(revealedCount(0.25, 4, "char"), 1);
  assert.equal(revealedCount(0.49, 4, "char"), 1);
  assert.equal(revealedCount(0.75, 4, "char"), 3);
});

test("word granularity snaps: a unit flips at the midpoint of its slice", () => {
  assert.equal(revealedCount(0.12, 4, "word"), 0);
  assert.equal(revealedCount(0.13, 4, "word"), 1);
  assert.equal(revealedCount(0.37, 4, "word"), 1);
  assert.equal(revealedCount(0.38, 4, "word"), 2);
});

test("revealedCount is monotonic in progress", () => {
  let previous = 0;
  for (let step = 0; step <= 100; step += 1) {
    const count = revealedCount(step / 100, 13, "char");
    assert.ok(count >= previous, `count went backwards at ${step}`);
    previous = count;
  }
});

test("revealedCount handles an empty statement", () => {
  assert.equal(revealedCount(0.5, 0, "char"), 0);
  assert.deepEqual(unitRange(0, 0, "char"), [0, 1]);
});

test("unitRange windows ascend, stay inside 0..1 and never have zero width", () => {
  const total = 9;
  for (const granularity of ["char", "word"] as const) {
    let previousStart = -1;
    for (let index = 0; index < total; index += 1) {
      const [start, end] = unitRange(index, total, granularity);
      assert.ok(start >= 0 && start <= 1, `start ${start} out of range`);
      assert.ok(end > start, `window ${index} has no width`);
      assert.ok(end <= 1, `end ${end} out of range`);
      assert.ok(start > previousStart, "windows must ascend");
      previousStart = start;
    }
  }
});

test("word windows are hard slices, char windows overlap their neighbours", () => {
  const [wordStart, wordEnd] = unitRange(0, 4, "word");
  assert.equal(wordStart, 0);
  assert.equal(wordEnd, 0.25);
  const [charStart, charEnd] = unitRange(0, 10, "char");
  assert.equal(charStart, 0);
  assert.ok(charEnd > 0.1, "a char window spans more than its own slice");
});

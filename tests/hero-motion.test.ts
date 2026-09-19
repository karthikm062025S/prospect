import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// v9 hero motion. The hero's deliberate-engineering pass is three pieces, all
// on motion/react primitives: a Rise entrance stagger over the five non-H1 copy
// blocks (the H1 has its own char reveal), pointer parallax on the art layer,
// and magnetic CTAs. Each has its own settled/reduced-motion gate; this test
// only locks the wiring into hero.tsx so a later edit cannot silently drop it.

const HERO = fs.readFileSync("components/landing/hero.tsx", "utf8");

test("five copy blocks carry a staggered Rise", () => {
  const rises = HERO.match(/<Rise delay=/g) ?? [];
  assert.equal(rises.length, 5, "expected five staggered <Rise delay=...> wrappers in the hero");
});

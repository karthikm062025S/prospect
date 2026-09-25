import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// Redesign 2026-09-20 hero motion. Three pieces, all on
// motion/react primitives: a Rise entrance stagger over the five non-H1 copy
// blocks (the H1 is the wordmark, with its own per-letter rise), scroll
// parallax over four painted planes with the wordmark between sky and ridges,
// and a settled branch that renders every plane at rest. This locks the
// wiring into hero.tsx so a later edit cannot silently drop it.

const HERO = fs.readFileSync("components/landing/hero.tsx", "utf8");

test("five copy blocks carry a staggered Rise", () => {
  const rises = HERO.match(/<Rise delay=/g) ?? [];
  assert.equal(rises.length, 5, "expected five staggered <Rise delay=...> wrappers in the hero");
});

test("the parallax is scroll-tied to the hero on motion v13 only", () => {
  assert.match(HERO, /useScroll\(\{ target: ref, offset: \["start start", "end start"\] \}\)/);
  assert.match(HERO, /useTransform\(progress, \[0, 1\]/);
  assert.doesNotMatch(HERO, /lenis|gsap|scrollmagic/i, "D4: no motion library but motion");
});

test("four planes plus the wordmark, rates increasing back to front", () => {
  const rates = HERO.match(/const RATE = \{ sky: ([\d.]+), wordmark: ([\d.]+), ridges: ([\d.]+), hills: ([\d.]+), near: ([\d.]+) \}/);
  assert.ok(rates, "RATE must name sky, wordmark, ridges, hills, near in that order");
  const values = rates.slice(1, 6).map(Number);
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i] > values[i - 1], `rate ${i} must exceed rate ${i - 1} (back to front)`);
  }
  // DOM order is the z-order: sky, then the H1 wordmark, then the ridges.
  const sky = HERO.indexOf('name="sky"');
  const h1 = HERO.indexOf('id="hero-heading"');
  const ridges = HERO.indexOf('name="ridges"');
  assert.ok(sky > -1 && h1 > sky && ridges > h1, "wordmark must sit between the sky and the ridges");
  for (const name of ["sky", "ridges", "hills", "near"]) {
    assert.match(HERO, new RegExp(`name="${name}"`), `missing the ${name} plane`);
  }
});

test("reduced motion renders the planes at rest", () => {
  assert.match(HERO, /const settled = useSettled\(\);/);
  assert.match(HERO, /if \(settled\) return <div className="absolute inset-0 -z-10">\{children\}<\/div>;/);
});

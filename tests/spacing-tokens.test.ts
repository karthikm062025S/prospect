import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RISE_DURATION,
  RISE_EASE,
  RISE_STAGGER,
  RISE_STAGGER_CAP,
  riseDelay,
} from "../components/motion/rise-math.ts";

// C7 (build/MISSION.md, UI/UX polish 2026-09-19): the signed-in app has ONE
// vertical rhythm. design/SYSTEM.md "Spacing and rhythm": every vertical gap is
// `--section-y`, the 24px block gap or the 12px stack gap, and rows use the
// 12x16 row padding — "no ad hoc mt-8/mt-9/mt-14 or one-off pixel margins".
// design/MISTAKES.md logs the round where exactly those ad hoc values made the
// rhythm drift section to section.
//
// This encodes the mission's grep gate as a test so the rhythm cannot drift
// back in silently. It is deliberately a SOURCE scan, not a render: the
// violation is the literal class in the file.

const ROOT = fileURLToPath(new URL("../", import.meta.url));

// Lane D's fence (build/MISSION.md leaf 6). Files outside it are another
// lane's to fix; widening this list is how the gate grows once they land.
const APP_DIR = path.join(ROOT, "app", "(app)");
const FENCED_COMPONENTS = [
  "home-list",
  "role-row",
  "role-detail-pane",
  "detail-pane",
  "company-group",
  "tab-bar",
  "tab-bar-server",
  "filter-chips",
  "pill-dropdown",
  "velocity-strip",
  "labels-bar",
  "student-profile-card",
  "profile-banner",
  "icons",
  "search-input",
  "sort-control",
  "stale-badge",
  "save-indicator",
  "correction-control",
  "get-started",
  "company-avatar",
  "applications-split",
].map((name) => path.join(ROOT, "components", `${name}.tsx`));

function walk(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

const FILES = [
  ...walk(APP_DIR),
  ...FENCED_COMPONENTS.filter((file) => fs.existsSync(file)),
  ...walk(path.join(ROOT, "components", "roadmap")),
  ...walk(path.join(ROOT, "components", "motion")),
];

// Under app/(app) but NOT in lane D's fence, so lane D may not edit them.
// Both still carry a hardcoded radius and are reported to the orchestrator:
// - app/(app)/auth/update-password/page.tsx  rounded-2xl
// - app/(app)/journey/loading.tsx            style={{ borderRadius: "var(--radius-card, 16px)" }}
// Delete an entry here the moment its owner lands the token fix.
const OUT_OF_LANE_D_FENCE = new Set([
  "app/(app)/auth/update-password/page.tsx",
  "app/(app)/journey/loading.tsx",
]);

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function relative(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

test("the lane D fence is a real, non-empty file set", () => {
  assert.ok(FILES.length > 20, `expected the fence to resolve, got ${FILES.length} files`);
});

test("C7: no ad hoc margin/padding one-offs in the signed-in app", () => {
  // The mission's gate verbatim: m/p + t|b|y + an off-token step. `min-h-*`
  // and `max-h-*` are sizes, not rhythm, and never match this pattern.
  const AD_HOC = /\b(m|p)[tby]-(5|7|9|10|11|13|14|15|18|20)\b/g;
  const offenders: string[] = [];
  for (const file of FILES) {
    for (const match of read(file).matchAll(AD_HOC)) {
      offenders.push(`${relative(file)}: ${match[0]}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `ad hoc spacing (use --section-y, gap-6 = 24px block, gap-3 = 12px stack, or the 12x16 row padding):\n${offenders.join("\n")}`,
  );
});

test("cards use the radius TOKEN, never a hardcoded pixel radius", () => {
  // SYSTEM.md Components: cards are --radius-card, pills --radius-pill,
  // dropdown surfaces --radius-panel. A literal `rounded-2xl` or an inline
  // `var(--radius-card, 16px)` fallback is how two card radii drift apart.
  const offenders: string[] = [];
  for (const file of FILES.filter((f) => !OUT_OF_LANE_D_FENCE.has(relative(f)))) {
    const source = read(file);
    for (const bad of ["rounded-2xl", "rounded-3xl", "radius-card, 16px", "rounded-[18px]"]) {
      if (source.includes(bad)) offenders.push(`${relative(file)}: ${bad}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `use rounded-card / rounded-pill / rounded-panel:\n${offenders.join("\n")}`,
  );
});

test("Rise respects reduced motion and stays inside the SYSTEM.md stagger range", () => {
  // SYSTEM.md Motion grammar: Rise is 12px + fade, 200ms, ease
  // [0.23, 1, 0.32, 1], sibling stagger 0.04-0.06s, and OFF under
  // prefers-reduced-motion / the Settled setting. The .tsx half is read as
  // SOURCE (the codebase convention for UI — no DOM runner is installed, and
  // --experimental-strip-types cannot strip JSX); the pure timings live in
  // rise-math.ts and are exercised for real.
  const source = read(path.join(ROOT, "components", "motion", "rise.tsx"));
  assert.match(source, /useSettled/, "Rise must consult useSettled (reduced motion + the Settled setting)");
  assert.match(source, /if \(settled\)/, "Rise must have an instant, un-animated branch, not a slowed one");
  assert.match(source, /initial=\{\{ opacity: 0, y: 12 \}\}/, "Rise is a 12px rise + fade");

  assert.equal(RISE_DURATION, 0.2);
  assert.deepEqual([...RISE_EASE], [0.23, 1, 0.32, 1]);
  assert.ok(RISE_STAGGER >= 0.04 && RISE_STAGGER <= 0.06, `stagger ${RISE_STAGGER} is outside 0.04-0.06`);
  assert.equal(riseDelay(0), 0);
  assert.equal(riseDelay(-3), 0, "a negative index must not produce a negative delay");
  assert.equal(riseDelay(1000), RISE_STAGGER_CAP * RISE_STAGGER, "the delay must be capped for long lists");
});

test("feed rows and roadmap nodes actually Rise, with a stagger", () => {
  assert.match(read(path.join(ROOT, "components", "role-row.tsx")), /<Rise as="div" index=\{riseIndex/);
  assert.match(read(path.join(ROOT, "components", "home-list.tsx")), /riseIndex=\{riseIndexById\.get\(row\.id\)\}/);
  assert.match(read(path.join(ROOT, "components", "roadmap", "timeline.tsx")), /<Rise as="li" key=\{node\.id\} index=\{index\}/);
  assert.match(read(path.join(ROOT, "components", "velocity-strip.tsx")), /SlidingNumber/);
});

test("SlidingNumber renders a static value under reduced motion", () => {
  const source = read(path.join(ROOT, "components", "motion", "sliding-number.tsx"));
  assert.match(source, /useSettled/);
  assert.match(source, /if \(settled\) return/);
});

test("the roadmap timeline scrolls inside itself, never the page", () => {
  // Baseline defect 2 (build/ui-baseline/journey-390-before.png): the semester
  // columns pushed the whole page into a horizontal scroll at 390. A flex/grid
  // child's min-width defaults to auto, so every ancestor of the scroller
  // needs min-w-0 for `overflow-x-auto` to actually bound it.
  const timeline = read(path.join(ROOT, "components", "roadmap", "timeline.tsx"));
  assert.match(timeline, /overflow-x-auto/);
  assert.match(timeline, /min-w-0/);
  assert.match(timeline, /snap-x/);
  assert.match(timeline, /overscroll-x-contain/);

  const board = read(path.join(ROOT, "components", "roadmap", "roadmap-board.tsx"));
  assert.match(board, /flex min-w-0 flex-col/);

  const page = read(path.join(ROOT, "app", "(app)", "journey", "page.tsx"));
  assert.match(page, /grid min-w-0 items-start/);
});

test("the tab bar never leaves a clipped tab label", () => {
  // Baseline defect 3: "Applications" rendered as "APP" at 390. The bar is a
  // scroller below md (SYSTEM.md Navigation), so the label must not wrap or
  // truncate and the ACTIVE tab must be scrolled fully into view.
  const source = read(path.join(ROOT, "components", "tab-bar.tsx"));
  assert.match(source, /whitespace-nowrap/);
  assert.match(source, /scrollIntoView/);
  assert.doesNotMatch(source, /\btruncate\b/, "a nav tab label must never be truncated");
});

test("the liveness label and the added label never print the same day twice", () => {
  // Baseline defect 1: rows read "SEEN TODAY TODAY" (the liveness label
  // already carries the day). role-row.tsx is .tsx, so the predicate is
  // re-derived here from its one-line body and exercised against the real
  // lib/liveness.ts + lib/sort.ts label pairs; the source assertion below
  // pins that the row actually calls it.
  const source = read(path.join(ROOT, "components", "role-row.tsx"));
  assert.match(
    source,
    /export function addedRepeatsLiveness\(liveness: string, added: string\): boolean \{\s*return liveness\.toLowerCase\(\)\.endsWith\(` \$\{added\.toLowerCase\(\)\}`\);/,
    "the predicate changed: update the copy below to match",
  );
  const addedRepeatsLiveness = (liveness: string, added: string) =>
    liveness.toLowerCase().endsWith(` ${added.toLowerCase()}`);

  assert.equal(addedRepeatsLiveness("seen today", "Today"), true, "'seen today' + 'Today' is the reported defect");
  assert.equal(addedRepeatsLiveness("last seen 2 days ago", "2d ago"), false);
  assert.equal(addedRepeatsLiveness("seen once Sep 3", "2w ago"), false);
  assert.equal(addedRepeatsLiveness("seen today", "Yesterday"), false);

  // And the row must render the added label behind that guard.
  assert.match(source, /addedRepeatsLiveness\(row\.liveness, relativeDay\(row\.created_at, nowMs\)\) \? null :/);
});

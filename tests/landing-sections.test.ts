import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// Lane C / MISSION C6. The landing's contract with the reference: the sections
// exist, in the reference's order, the two motion pieces have a real
// reduced-motion branch, the before/after band is a pinned scroll scene whose
// settled state is the whole record, every number is fetched, and the
// screenshot strip reads public/mocks.
//
// A source-shape test, deliberately: `npm test` is node --experimental-strip-types
// with no DOM and no renderer (next/cache alone cannot be imported here, see the
// header of lib/public-stats-format.ts), so the alternative is no gate at all.
// The rendered check is the orchestrator's screenshot pass.

const PAGE = "app/welcome/page.tsx";

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

test("the ten bands exist in the reference's order", () => {
  const page = read(PAGE);
  const order = [
    "<Hero ",
    "<StatementBand />",
    "<ScreenshotStrip />",
    "<StatsRow ",
    'id="feed"',
    'id="roadmap"',
    'id="labels"',
    "<FeatureCards ",
    "<UnderTheHood />",
    'id="privacy"',
    'id="get-started"',
    "<footer",
  ];
  let cursor = -1;
  for (const marker of order) {
    const at = page.indexOf(marker, cursor + 1);
    assert.notEqual(at, -1, `${marker} is missing from the landing`);
    assert.ok(at > cursor, `${marker} is out of order on the landing`);
    cursor = at;
  }
});

test("every band names its own heading for assistive tech", () => {
  const page = `${read(PAGE)}${read("components/landing/hero.tsx")}${read(
    "components/landing/showcase.tsx",
  )}${read("components/landing/stats-row.tsx")}${read("components/landing/feature-cards.tsx")}${read(
    "components/landing/under-the-hood.tsx",
  )}${read("components/landing/wordmark-strip.tsx")}`;
  for (const id of [
    "hero-heading",
    "welcome-heading",
    "strip-heading",
    "stats-heading",
    "labels-heading",
    "privacy-heading",
    "get-started-heading",
  ]) {
    assert.ok(page.includes(id), `no section is labelled by ${id}`);
  }
  // The two Showcase bands and the card/hood bands derive theirs from the id.
  assert.match(read("components/landing/showcase.tsx"), /const headingId = `\$\{id\}-heading`;/);
});

test("the hero wordmark reveals per character, the statement per word, and both go static under reduced motion", () => {
  // Redesign 2026-09-19: the H1 is the wordmark (character granularity is the
  // hero's alone, SYSTEM.md Motion grammar); the sentence moved to the cream
  // StatementBand and keeps its word-by-word reveal.
  const hero = read("components/landing/hero.tsx");
  assert.match(hero, /as="h1"/);
  assert.match(hero, /granularity="char"/);
  const statement = read("components/landing/wordmark-strip.tsx");
  assert.match(statement, /export function StatementBand/);
  assert.match(statement, /granularity="word"/);
  // The reveal primitive's reduced-motion branch: useSettled() is
  // prefers-reduced-motion OR the in-app Settled setting, and the settled path
  // paints the REVEALED colour with no observer and no per-unit transition.
  const reveal = read("components/motion/text-reveal.tsx");
  assert.match(reveal, /const settled = useSettled\(\);/);
  assert.match(reveal, /const revealed = settled \|\| inView;/);
  assert.match(read("components/motion/settled.tsx"), /return forced \|\| reduced === true;/);
});

test("the screenshot marquee is the shared primitive and has a static branch", () => {
  const strip = read("components/landing/wordmark-strip.tsx");
  assert.match(strip, /<ScrollVelocityMarquee/);
  const marquee = read("components/motion/scroll-velocity-marquee.tsx");
  // Settled renders the children ONCE in a plain wrapped row: no observer, no
  // frame loop, no transform. A static end state, not a slowed animation.
  assert.match(marquee, /if \(settled\) \{[\s\S]*?flex flex-wrap items-center/);
});

test("the strip reads public/mocks and names its empty state", () => {
  const mocks = read("components/landing/mocks.ts");
  assert.match(mocks, /"public", "mocks"/);
  assert.match(mocks, /\.toLowerCase\(\)\.endsWith\("\.png"\)/);
  const strip = read("components/landing/wordmark-strip.tsx");
  assert.match(strip, /shots\.length === 0/);
  assert.match(strip, /App screenshots pending/);
  // The folder ships with its README and nothing else, so the empty state is
  // the state that actually renders until the orchestrator drops captures in.
  assert.ok(fs.existsSync("public/mocks/README.md"));
  const pngs = fs.readdirSync("public/mocks").filter((f) => f.endsWith(".png"));
  assert.ok(Array.isArray(pngs));
});

test("the before/after band is a pinned scene driven only by scroll", () => {
  // Redesign 2026-09-20 (L3): the clip-path wipe and its range input are gone.
  // The wipe could only ever show ONE side at a time, which is the opposite of
  // the point the band makes. Scroll position is the single input now, so
  // there is nothing to drag and no control invented for the animation.
  const source = read("components/landing/before-after.tsx");
  // The ONE pinning primitive on the landing, not a second one.
  assert.match(source, /usePinProgress/);
  assert.match(source, /sticky top-0/);
  assert.match(source, /h-\[240dvh\]/);
  // Every value is a function of scroll offset, so the scene is reversible
  // rather than a fired-once timeline.
  assert.match(source, /useTransform\(progress, \[start, end\]/);
  assert.doesNotMatch(source, /type="range"/, "the band takes no control of its own");
});

test("the before/after band renders its whole record with no pin when it must", () => {
  // The accessibility floor: reduced motion, the Settled setting, and a
  // viewport too narrow for two panes all render the complete record — every
  // field and every chip — with no runway and no interpolation. Nothing on
  // this band is reachable only from a scroll position.
  const source = read("components/landing/before-after.tsx");
  assert.match(source, /const settled = useSettled\(\);/);
  assert.match(source, /const pinned = wide && !settled;/);
  assert.match(source, /if \(!pinned\)/);
  assert.match(source, /animate=\{false\}/);
  const pin = read("components/motion/pin-scene.tsx");
  // `skip` is a dependency of the measurement, not just a guard: the runway
  // only exists while the scene is pinned.
  assert.match(pin, /if \(skip\) return undefined;/);
  assert.match(pin, /\}, \[ref, skip\]\);/);
});

test("the before/after posting is a real feed row, never an invented one", () => {
  assert.match(read(PAGE), /<BeforeAfter row=\{feed\[0\] \?\? null\} \/>/);
  const source = read("components/landing/before-after.tsx");
  assert.match(source, /if \(!row\)/, "a missing feed row must render a named empty state");
  assert.match(source, /Live feed unavailable/);
});

test("every figure on the landing is fetched, never hardcoded", () => {
  // The three stat figures and the feed card's metric all go through
  // formatStat() on a value that came from getPublicStats().
  const stats = read("components/landing/stats-row.tsx");
  assert.match(stats, /stats\.openRoles/);
  assert.match(stats, /stats\.companies/);
  assert.match(stats, /stats\.addedLast24h/);
  assert.match(stats, /formatStat\(figure\.value\)/);
  assert.doesNotMatch(
    stats,
    /[>"']\s*\d{2,}[\s<"']/,
    "a multi-digit literal in the stats band would be a hardcoded figure",
  );
  assert.match(read("components/landing/feature-cards.tsx"), /formatStat\(openRoles\)/);
});

test("no forbidden claim reaches the landing", () => {
  const files = [
    PAGE,
    ...fs
      .readdirSync("components/landing")
      .map((f) => `components/landing/${f}`)
      .filter((f) => /\.tsx?$/.test(f)),
  ];
  // CONTEXT "Never say", checked against RENDERED copy: comments and imports
  // legitimately mention the auth provider by path, so the scan strips them.
  const banned = [/within 1 hour/i, /verify employers/i, /\bthe first\b/i, /ghost job/i];
  const offenders: string[] = [];
  for (const file of files) {
    const code = fs
      .readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    for (const pattern of banned) {
      if (pattern.test(code)) offenders.push(`${file}: ${pattern}`);
    }
  }
  assert.deepEqual(offenders, []);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// Lane C / MISSION C6. The landing's contract with the reference: the sections
// exist, in the reference's order, the two motion pieces have a real
// reduced-motion branch, the before/after works by pointer AND keyboard, every
// number is fetched, and the screenshot strip reads public/mocks.
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
  // Redesign 2026-09-20: the H1 is Karthik's SVG wordmark (character
  // granularity is the hero's alone, SYSTEM.md Motion grammar): eight letter
  // paths in reading order, each rising on its own delay, named "Prospect"
  // for assistive tech. The sentence stays in the cream StatementBand with
  // its word-by-word reveal.
  const hero = read("components/landing/hero.tsx");
  assert.match(hero, /<h1\s+id="hero-heading"/);
  assert.match(hero, /<Wordmark entrance/);
  const wordmark = read("components/brand/wordmark.tsx");
  assert.match(wordmark, /aria-label="Prospect"/);
  assert.equal((wordmark.match(/\{ char: "[a-z]", d: "M/g) ?? []).length, 8, "eight letter paths");
  assert.match(wordmark, /\{ char: "p".*\n.*\{ char: "r".*\n.*\{ char: "o".*\n.*\{ char: "s".*\n.*\{ char: "p".*\n.*\{ char: "e".*\n.*\{ char: "c".*\n.*\{ char: "t"/);
  assert.match(wordmark, /delay: index \* LETTER_STAGGER/);
  // D2: VT maroon letters, VT orange sparkle and nugget, nothing else.
  assert.match(wordmark, /const MAROON = "#861F41";/);
  assert.match(wordmark, /const ORANGE = "#E5751F";/);
  assert.doesNotMatch(wordmark, /#711731|#D6681D|#EE8A32/, "the file's own colours must be recoloured");
  // Settled renders plain <path>s, fully visible, no motion values.
  assert.match(wordmark, /const settled = useSettled\(\);/);
  assert.match(wordmark, /const animate = entrance && !settled;/);
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

test("the before/after slider works by pointer and by keyboard", () => {
  const source = read("components/landing/before-after.tsx");
  // A native range input is pointer-draggable AND arrow-key operable, and it
  // carries its own label. One control, one code path.
  assert.match(source, /type="range"/);
  assert.match(source, /onChange=\{\(event\) => setSplit\(Number\(event\.target\.value\)\)\}/);
  assert.match(source, /<label/);
  assert.match(source, /clipPath: `inset\(0 0 0 \$\{offset\}px\)`/);
  // 44px target (SYSTEM.md / ui_laws 2) and a visible focus ring.
  assert.match(source, /h-11 w-full/);
  assert.match(source, /focus-visible:ring-2/);
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

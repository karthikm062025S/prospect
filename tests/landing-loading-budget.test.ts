import assert from "node:assert";
import fs from "node:fs";
import test from "node:test";

// v7 perf lane. The three loading-strategy decisions that took mobile /welcome
// from 1085 KiB to 532 KiB and its Lighthouse LCP from 7.5s to 4.6s. Each one
// is a single line that a later edit could silently undo with no visible
// symptom in dev, on desktop, or in any other test — which is exactly why they
// are asserted here rather than trusted.

const LAYOUT = "app/layout.tsx";
const SHEET = "components/landing/sheet-texture.tsx";
const HERO = "components/landing/hero.tsx";
const ART = "components/landing/art.tsx";
const PAGE = "app/welcome/page.tsx";

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

/** The block of a `localFont({ ... })` call assigned to `name`. */
function fontBlock(source: string, name: string): string {
  const start = source.indexOf(`const ${name} = localFont({`);
  assert.notEqual(start, -1, `no localFont call for ${name} in ${LAYOUT}`);
  const end = source.indexOf("});", start);
  assert.notEqual(end, -1, `unterminated localFont call for ${name}`);
  return source.slice(start, end);
}

// `variable` sits on <html> in the root layout, so next/font preloads every
// declared face on EVERY route. Prospect 2026-09-19 is down to three declared
// faces, so only their preload posture is asserted here.
test("fonts that paint above the fold on /welcome stay preloaded", () => {
  const source = read(LAYOUT);
  for (const name of ["satoshi", "dmSans", "plexMono"]) {
    assert.doesNotMatch(
      fontBlock(source, name),
      /preload:\s*false/,
      `${name} paints above the fold on /welcome and must stay preloaded`,
    );
  }
});

// SheetTexture renders null below 1024px, but a static import shipped the
// whole WebGL shader runtime (105 KB parsed) to every phone anyway.
test("the shader runtime is imported lazily, never statically", () => {
  const source = read(SHEET);
  assert.doesNotMatch(
    source,
    /^import\s[^\n]*@paper-design\/shaders-react/m,
    "@paper-design/shaders-react must not be a static import: it is desktop-only",
  );
  assert.match(source, /dynamic\(\s*\(\)\s*=>\s*import\("@paper-design\/shaders-react"\)/);
});

// `display: none` does not stop an <img> downloading. The hero used to mount
// both crops behind `hidden sm:block` / `sm:hidden` and paid for all four
// posters (192 KB) to paint one.
test("the hero art ships one crop, not both", () => {
  const hero = read(HERO);
  assert.doesNotMatch(
    hero,
    /className="hidden size-full sm:block"/,
    "the crop swap must be a <picture> media source, not a hidden sibling tree",
  );
  assert.match(hero, /<ArtPoster work=\{HERO_TALL\} wide=\{HERO_WIDE\} priority \/>/);

  const art = read(ART);
  assert.match(art, /<source\s+media=\{WIDE_CROP_FROM\}/);
  assert.match(art, /const WIDE_CROP_FROM = "\(min-width: 640px\)"/);
});

// v8 D1: Playwrite is removed entirely. The handwritten line now renders in
// the display face (already preloaded above; upright since 2026-09-05), so
// there is nothing left to defer.
test("the handwritten line has no separate deferred face", () => {
  assert.doesNotMatch(read(PAGE), /className="font-hand/, "font-hand is removed (v8 D1)");
  assert.match(read("components/landing/hand-line.tsx"), /font-display /);
});

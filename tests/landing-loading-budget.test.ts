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
// declared face on EVERY route. v8 D1 removed Zilla and Playwrite entirely
// (they are no longer declared), so only the preload posture of the
// remaining faces is asserted here.
test("fonts that paint above the fold on /welcome stay preloaded", () => {
  const source = read(LAYOUT);
  for (const name of ["instrumentSerif", "departure"]) {
    assert.doesNotMatch(
      fontBlock(source, name),
      /preload:\s*false/,
      `${name} paints above the fold on /welcome and must stay preloaded`,
    );
  }
  // Satoshi loads from Fontshare's CDN (not next/font/local; see tests/fonts.test.ts),
  // so its eager-load equivalent is a blocking <link rel="stylesheet"> in <head>,
  // never a deferred/lazy fetch.
  assert.match(
    source,
    /<link\s+rel="stylesheet"\s+href="https:\/\/api\.fontshare\.com\/v2\/css\?f\[\]=satoshi@/,
    "satoshi paints above the fold on /welcome and must load eagerly from Fontshare",
  );
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
// posters (192 KB) to paint one. Redesign 2026-09-20: the hero is four painted
// planes (public/art/hero/*), each ONE <picture> with a WebP source and a PNG
// fallback, so a browser fetches one encoding per plane; all four paint above
// the fold, so all four load eagerly, never lazily, and never through
// next/image (which would re-encode the cut layers).
test("the hero art ships one encoding per plane, eagerly", () => {
  const hero = read(HERO);
  assert.doesNotMatch(
    hero,
    /className="hidden size-full sm:block"/,
    "no hidden sibling tree: a swap must be a <picture> source",
  );
  assert.match(hero, /<source type="image\/webp" srcSet=\{`\/art\/hero\/\$\{name\}\.webp`\} \/>/);
  assert.match(hero, /src=\{`\/art\/hero\/\$\{name\}\.png`\}/);
  assert.match(hero, /loading="eager"/);
  assert.match(hero, /fetchPriority="high"/);
  assert.doesNotMatch(hero, /loading="lazy"/);
  assert.doesNotMatch(hero, /from "next\/image"/);
  const planes = hero.match(/<Art\s+name="(sky|ridges|hills|near)"/g) ?? [];
  assert.equal(planes.length, 4, "exactly four planes");

  // The poster primitive keeps its media-source crop swap for any other band.
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

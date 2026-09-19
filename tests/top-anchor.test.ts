import assert from "node:assert";
import fs from "node:fs";
import test from "node:test";

// The landing's logo/back-to-top anchor used to target `#top`, an empty
// `<span id="top" />` in app/welcome/page.tsx with a 0x0 client rect. Next's
// <Link href="#top"> special-cases "top" to scroll document.body regardless
// (node_modules/next/dist/client/components/layout-router.js), so it never
// even looked at that span; native anchors did resolve it, onto nothing
// visible. hero.tsx already renders a real, full-height <section id="hero">
// at the top of the page, so that is now the one landing-top target. This
// guards against either half of the fix quietly regressing.

const PAGE = "app/welcome/page.tsx";
const NAV = "components/landing/landing-nav.tsx";
const FEEDBACK = "components/landing/feedback.tsx";
const HERO = "components/landing/hero.tsx";

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

test("the dead #top span is gone from the welcome page", () => {
  assert.doesNotMatch(read(PAGE), /id="top"/, "the empty #top span must stay removed");
});

test("both nav logos (capsule and mobile sheet) target #hero, not #top", () => {
  const nav = read(NAV);
  assert.doesNotMatch(nav, /#top/, "no landing nav element may point at #top");
  const matches = nav.match(/<Logo href="#hero"/g);
  assert.equal(matches?.length, 2, "expected two <Logo href=\"#hero\"> uses: capsule nav + mobile sheet");
});

test("BackToTop targets #hero, not #top", () => {
  const feedback = read(FEEDBACK);
  assert.doesNotMatch(feedback, /#top/, "BackToTop must not point at #top");
  assert.match(feedback, /href="#hero"/, "BackToTop must point at #hero");
});

test("the hero section still carries id=\"hero\", the one landing-top target", () => {
  assert.match(read(HERO), /id="hero"/, "hero.tsx must keep id=\"hero\": it is the anchor target every landing link relies on");
});

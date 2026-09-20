import { test } from "node:test";
import assert from "node:assert/strict";

// Mirrors proxy.ts exactly. Next requires this matcher to remain an in-file
// literal, and importing proxy.ts would pull Next request internals into the
// plain Node test runner.
const PROXY_MATCHER =
  "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|og.png|manifest.webmanifest|fonts/|art/|brand/|api/).*)";

function matcherRuns(pathname: string) {
  return new RegExp(`^${PROXY_MATCHER}$`).test(pathname);
}

function classify(pathname: string, signedIn = false) {
  if (!matcherRuns(pathname)) return "skipped";
  // Karthik 2026-09-04: signed-in users skip the landing.
  if (signedIn && pathname === "/welcome") return "signed-in redirect to /";
  if (!signedIn && pathname === "/") return "signed-out rewrite";
  if (
    pathname === "/welcome" ||
    pathname === "/privacy" ||
    pathname === "/faq" ||
    pathname === "/terms" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/.well-known/")
  ) {
    return "public";
  }
  return "authenticated";
}

test("proxy matcher and public-path split classify app and public pages", () => {
  assert.equal(classify("/"), "signed-out rewrite");
  assert.equal(classify("/applications"), "authenticated");
  assert.equal(classify("/welcome"), "public");
  assert.equal(classify("/privacy"), "public");
  assert.equal(classify("/faq"), "public");
  assert.equal(classify("/terms"), "public");
  assert.equal(classify("/auth/callback"), "public");
});

test("proxy matcher redirects signed-in users away from /welcome to /", () => {
  assert.equal(classify("/welcome", true), "signed-in redirect to /");
  assert.equal(classify("/", true), "authenticated");
});

test("proxy matcher skips bearer-auth APIs and static assets", () => {
  assert.equal(classify("/api/x"), "skipped");
  assert.equal(classify("/_next/static/x"), "skipped");
  assert.equal(classify("/_next/image"), "skipped");
  assert.equal(classify("/art/poster.png"), "skipped");
  assert.equal(classify("/icon.svg"), "skipped");
  // v7 S4: the vendored brand marks are static files; without this the proxy
  // redirects every one of them to /welcome and no mark ever paints.
  assert.equal(classify("/brand/stripe.svg"), "skipped");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_COOKIE_OPTIONS } from "@supabase/ssr";
import { COOKIE_OPTIONS, SESSION_MAX_AGE_S, sessionCookieOptions } from "../lib/supabase/cookie-options.ts";

// v8 onboarding (Karthik decision 3): "when I close the tab it signs me out"
// must be impossible from this side. The session cookie's lifetime is an
// EXPLICIT number of ours, applied in every place a cookie is written, not a
// library default we happen to inherit.
//
// @supabase/ssr forces its own DEFAULT_COOKIE_OPTIONS.maxAge on every set
// (cookies.ts setItem / applyServerStorage: `...cookieOptions` is followed by
// `maxAge: DEFAULT_COOKIE_OPTIONS.maxAge`), so a value in `cookieOptions`
// alone would be ignored. `sessionCookieOptions` is applied inside each
// factory's setAll, where the value actually reaches Set-Cookie.

const THIRTY_DAYS_S = 30 * 24 * 60 * 60;
const FOUR_HUNDRED_DAYS_S = 400 * 24 * 60 * 60;

function code(file: string) {
  return readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("the explicit session lifetime is 400 days, the browser cap, and outlives the ~30-day promise", () => {
  assert.equal(SESSION_MAX_AGE_S, FOUR_HUNDRED_DAYS_S);
  assert.ok(SESSION_MAX_AGE_S >= THIRTY_DAYS_S);
  assert.equal(COOKIE_OPTIONS.maxAge, SESSION_MAX_AGE_S);
  assert.equal(COOKIE_OPTIONS.httpOnly, true, "SR-003: the session cookie stays out of JavaScript");
  assert.equal(COOKIE_OPTIONS.secure, true);
  assert.equal(COOKIE_OPTIONS.sameSite, "lax");
});

test("the library default still matches ours (a bump that changes it is a visible diff here)", () => {
  assert.equal(DEFAULT_COOKIE_OPTIONS.maxAge, SESSION_MAX_AGE_S);
});

test("sessionCookieOptions forces the lifetime on writes and leaves removals alone", () => {
  assert.equal(sessionCookieOptions({ maxAge: 5, path: "/" }).maxAge, SESSION_MAX_AGE_S);
  assert.equal(sessionCookieOptions(undefined).maxAge, SESSION_MAX_AGE_S);
  // A session-only cookie (no maxAge at all) must never leave this helper.
  assert.equal(sessionCookieOptions({ path: "/" }).maxAge, SESSION_MAX_AGE_S);
  // Sign-out writes maxAge 0; turning that into a 400-day empty cookie would
  // break sign-out.
  assert.deepEqual(sessionCookieOptions({ maxAge: 0, path: "/" }), { maxAge: 0, path: "/" });
});

// Every place that writes a session cookie: the request-scoped factory, the
// proxy, and the PKCE callback (which writes through the factory).
test("every cookie writer applies the explicit lifetime", () => {
  for (const file of ["lib/supabase/server.ts", "proxy.ts"]) {
    const source = code(file);
    assert.match(source, /cookieOptions:\s*COOKIE_OPTIONS/, `${file} must pass the shared COOKIE_OPTIONS`);
    assert.match(
      source,
      /\.set\(name, value, sessionCookieOptions\(options\)\)/,
      `${file} must write cookies through sessionCookieOptions()`,
    );
    assert.ok(!/maxAge/.test(source), `${file} must not carry its own maxAge; the one number lives in cookie-options.ts`);
  }
  const callback = code("app/auth/callback/route.ts");
  assert.match(callback, /from "@\/lib\/supabase\/server"/, "the callback must write cookies through lib/supabase/server.ts");
  assert.ok(!/createServerClient/.test(callback), "the callback must not build its own client with its own cookie options");
});

import type { CookieOptions } from "@supabase/ssr";

// v8 onboarding (Karthik decision 3, 2026-09-04): the session must survive a
// closed tab, so its lifetime is OUR number, not a library default.
//
// @supabase/ssr 0.12.x ignores a `maxAge` passed in `cookieOptions`: cookies.ts
// spreads DEFAULT_COOKIE_OPTIONS, then the caller's options, then overwrites
// `maxAge: DEFAULT_COOKIE_OPTIONS.maxAge` (400 days) on every set and
// `maxAge: 0` on every removal. So the explicit lifetime is applied where it
// actually lands, in each factory's `setAll` (`sessionCookieOptions`), which
// also protects against a future bump silently shortening the default.
// 400 days is the browser cap (Chrome enforces it); the only reason a signed-in
// browser drops the session before that is Supabase revoking the refresh token.
// tests/session-lifetime.test.ts pins all of this.
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 400;

// SR-003 (security review 2026-09-03): httpOnly because no browser Supabase
// client exists (lib/supabase/client.ts is imported by nothing); `secure` keeps
// the cookie off plain HTTP on a future custom domain (localhost is a secure
// context in every current browser, so dev keeps working).
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: SESSION_MAX_AGE_S,
} as const;

// A removal (`maxAge: 0`, empty value) must stay a removal or sign-out would
// write an empty 400-day cookie; everything else gets the explicit lifetime.
export function sessionCookieOptions(options: CookieOptions | undefined): CookieOptions {
  if (options?.maxAge === 0) return options;
  return { ...options, maxAge: SESSION_MAX_AGE_S };
}

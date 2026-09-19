import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_OPTIONS, sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { authOutageError, isAuthOutage } from "@/lib/require-user";

const PUBLIC_FILES = new Set([
  "/apple-icon.png",
  "/favicon.ico",
  "/icon.svg",
  "/manifest.webmanifest",
  "/og.png",
]);

// Cookie attributes and the explicit session lifetime live in
// lib/supabase/cookie-options.ts (shared with lib/supabase/server.ts).

function isPublicPath(pathname: string) {
  return (
    pathname === "/welcome" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image") ||
    pathname.startsWith("/fonts/") ||
    // v7 D20: the landing's art posters are public assets.
    pathname.startsWith("/art/") ||
    PUBLIC_FILES.has(pathname)
  );
}

// Next 16 renamed middleware.ts to proxy.ts. Besides enforcing authentication,
// the proxy refreshes cookie sessions so downstream Server Components receive
// the current access token. API routes keep their own bearer authentication.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail closed when auth cannot be initialized.
  if (!url || !anonKey) {
    return NextResponse.json({ error: "authentication not configured" }, { status: 503 });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, sessionCookieOptions(options)),
        );
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // An Auth outage must never read as "signed out" (locked rule: failures loud
  // and named). Public paths still render; everything else gets a named 503.
  if (isAuthOutage(error) && !isPublicPath(pathname)) {
    return NextResponse.json({ error: authOutageError(error!).message }, { status: 503 });
  }

  if (!user && pathname === "/") {
    return NextResponse.rewrite(new URL("/welcome", request.url));
  }

  if (!user && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/welcome", request.url));
  }

  // Karthik 2026-09-04: signed-in users skip the landing, unless they asked
  // for the landing hero explicitly (?view=landing) — e.g. the logo click.
  if (
    user &&
    pathname === "/welcome" &&
    request.nextUrl.searchParams.get("view") !== "landing"
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

// Next requires matcher entries to be static string literals in this file.
// tests/proxy-matcher.test.ts mirrors this exact string.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|og.png|manifest.webmanifest|fonts/|art/|brand/|api/).*)",
  ],
};

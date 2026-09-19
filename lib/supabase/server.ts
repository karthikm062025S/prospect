import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { COOKIE_OPTIONS, sessionCookieOptions } from "@/lib/supabase/cookie-options";

// Cookie attributes and the explicit session lifetime live in
// lib/supabase/cookie-options.ts (one source for this factory, proxy.ts and,
// through this factory, app/auth/callback/route.ts).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, sessionCookieOptions(options)),
            );
          } catch {
            // Called from a Server Component; proxy refreshes sessions.
          }
        },
      },
    },
  );
}

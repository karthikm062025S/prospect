// Type-only: erased at runtime, so the strip-types test runner never follows it.
import type { StoredProfile } from "./student-profile";

export function resolveUid(user: { id: string } | null | undefined): string | null {
  return user?.id ?? null;
}

// supabase-js RETURNS (never throws) an error from getUser(). "No session" is a
// normal signed-out read (AuthSessionMissingError / 4xx). A network failure or
// a 5xx from Supabase Auth is an OUTAGE and must be loud and named, never read
// as "signed out" (locked rule 13:25; auth validation 2026-09-19 BLOCKER).
export function isAuthOutage(error: { name?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  if (error.name === "AuthRetryableFetchError") return true;
  return typeof error.status === "number" && error.status >= 500;
}

export function authOutageError(error: { name?: string; message?: string; status?: number }): Error {
  return new Error(`AUTH_UNAVAILABLE: Supabase Auth did not answer (${error.name ?? "error"}${error.status ? " " + error.status : ""}): ${error.message ?? ""}`);
}

// Server actions are public POST endpoints resolvable from ANY route by their
// build-time ID -- the proxy matcher is NOT a gate for them. Every action must
// re-check the authenticated user. This is a plain server module, not a
// "use server" file, so sharing it does not turn the helper into an endpoint.
export async function requireUser(): Promise<string> {
  // Keep framework-only modules out of the pure resolveUid test's module load.
  const [{ redirect }, { createClient }] = await Promise.all([
    import("next/navigation"),
    import("@/lib/supabase/server"),
  ]);
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (isAuthOutage(error)) throw authOutageError(error!);
  const uid = resolveUid(user);

  if (!uid) {
    redirect("/welcome");
    // TS cannot narrow on a destructured never-returning import; this anchor keeps the return type honest.
    throw new Error("unreachable: redirect() never returns");
  }
  return uid;
}

// UI/UX D-UI4 (CONTEXT 20:30 "Flow"): /setup is mandatory until a profile row
// exists. One call at the top of every app page; /setup and /settings never
// call it. A Lakebase failure is NOT "no profile": it stays loud (locked rule
// 13:25), so only a real null row redirects. Deps are injectable so
// tests/require-profile.test.ts proves the gate without Next or a database.
export async function requireProfile(
  userId: string,
  deps: {
    getProfile?: (uid: string) => Promise<StoredProfile | null>;
    redirect?: (url: string) => never;
  } = {},
): Promise<StoredProfile> {
  const getProfile = deps.getProfile ?? (await import("@/lib/student-profile")).getProfile;
  const redirect = deps.redirect ?? (await import("next/navigation")).redirect;
  const row = await getProfile(userId);
  if (!row) {
    redirect("/setup");
    throw new Error("unreachable: redirect() never returns");
  }
  return row;
}

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

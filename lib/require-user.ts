export function resolveUid(user: { id: string } | null | undefined): string | null {
  return user?.id ?? null;
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
  } = await supabase.auth.getUser();
  const uid = resolveUid(user);

  if (!uid) {
    redirect("/welcome");
    // TS cannot narrow on a destructured never-returning import; this anchor keeps the return type honest.
    throw new Error("unreachable: redirect() never returns");
  }
  return uid;
}

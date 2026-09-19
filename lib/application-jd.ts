import type { SupabaseClient } from "@supabase/supabase-js";

// The applications-side twin of lib/role-jd.ts ensureRoleJd, minus the capture:
// an application's snapshot is written at apply time (copied from the role) or
// by recaptureJdAction, so reading it is the whole job. It lives here rather
// than inside the server action so a test can drive it against the fake
// Supabase client — app/application-actions.ts pulls in next/headers and the
// `@/lib/*` aliases, neither of which `node --experimental-strip-types`
// resolves. Type-only imports are stripped, so this file stays test-loadable.
export type ApplicationJd = { html: string | null; captured_at: string | null };

export async function fetchApplicationJd(
  supabase: SupabaseClient,
  uid: string,
  applicationId: string,
): Promise<ApplicationJd> {
  const { data, error } = await supabase
    .from("applications")
    .select("jd_snapshot, jd_snapshot_at")
    .eq("id", applicationId)
    .eq("user_id", uid)
    .maybeSingle();
  // A missing row or a read error is "nothing captured" — the pane renders its
  // "No posting text captured" state with the Capture button, which is the
  // right next move either way.
  if (error || !data) return { html: null, captured_at: null };
  return { html: data.jd_snapshot ?? null, captured_at: data.jd_snapshot_at ?? null };
}

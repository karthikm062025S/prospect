import type { SupabaseClient } from "@supabase/supabase-js";
import type { Application } from "./types";

export type ApplyToRoleResult =
  | { ok: true; application: Application }
  | { ok: false; reason: "not_found" | "already_applied" };

// Pure: the one place that turns a failed ApplyToRoleResult into the
// user-facing message, shared by app/actions.ts (confirmAppliedAction) and
// app/role-actions.ts (markAlreadyAppliedAction) so the two callers can't
// drift (L8 audit: both previously fell through an already_applied result
// as a silent `{ ok: true }` — nothing was recorded, nothing was said).
export function applyResultError(reason: "not_found" | "already_applied"): string {
  return reason === "not_found" ? "role not found" : "Already applied.";
}

// A shared role stays untouched. Applying creates a row owned by uid and links
// it through the uid+role_id user_roles row; other users keep seeing the role.
export async function applyToRole(
  supabase: SupabaseClient,
  uid: string,
  roleId: string,
  resumeFile?: string,
): Promise<ApplyToRoleResult> {
  const { data: role, error: roleError } = await supabase
    .from("roles_public")
    .select("id, company_id, title, link, lifecycle, jd_snapshot, jd_snapshot_at")
    .eq("id", roleId)
    .maybeSingle();
  if (roleError) throw new Error(`role lookup failed: ${roleError.message}`);
  if (!role || role.lifecycle !== "open") return { ok: false, reason: "not_found" };

  const { data: existing, error: existingError } = await supabase
    .from("user_roles")
    .select("application_id")
    .eq("user_id", uid)
    .eq("role_id", roleId)
    .maybeSingle();
  if (existingError) throw new Error(`user role lookup failed: ${existingError.message}`);
  if (existing?.application_id) return { ok: false, reason: "already_applied" };

  const now = new Date().toISOString();
  const { data: application, error: insertError } = await supabase
    .from("applications")
    .insert({
      user_id: uid,
      role_id: roleId,
      company_id: role.company_id,
      role: role.title,
      resume_file: resumeFile || null,
      jd_link: role.link,
      jd_snapshot: role.jd_snapshot,
      jd_snapshot_at: role.jd_snapshot_at,
      status_changed_at: now,
    })
    .select("*")
    .single();
  if (insertError) throw new Error(`application create failed: ${insertError.message}`);

  const { error: linkError } = await supabase.from("user_roles").upsert(
    {
      user_id: uid,
      role_id: roleId,
      application_id: application.id,
      apply_clicked_at: null,
      updated_at: now,
    },
    { onConflict: "user_id,role_id" },
  );
  if (linkError) {
    await supabase.from("applications").delete().eq("id", application.id).eq("user_id", uid);
    throw new Error(`user role link failed: ${linkError.message}`);
  }

  return { ok: true, application: application as Application };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "./types";

export type ApplyControl = "idle" | "confirming";

// Pure resolver for RB-013: confirming iff the role is still open AND a click
// has been stamped. No expiry — it survives tab-switch, reload, and app
// close/reopen. It is cleared ONLY by clearApplyClicked(): the "not_yet" action
// (slice 5) and the RB-014 application-delete restore path (slice 7) must both
// call it, or a restored role re-shows a stale confirmation (MISSION A7).
// ponytail: no expiry by design (RB-013)
export function applyControlState(role: { apply_clicked_at: string | null; lifecycle: Role["lifecycle"] }): ApplyControl {
  return role.lifecycle === "open" && role.apply_clicked_at !== null ? "confirming" : "idle";
}

export type ApplyIntentAction = "apply" | "not_yet";

// RB-010: activating Apply stamps now (opens the link + arms the confirmation
// in the same action). RB-012: "not_yet" clears with no record. The "Applied"
// answer itself is NOT here — it goes through lib/apply-role.ts's claim
// (slice 5 wires the server action).
export function nextApplyClickedAt(action: ApplyIntentAction, nowIso: string): string | null {
  return action === "apply" ? nowIso : null;
}

export type ApplyClickedResult = { ok: true } | { ok: false; reason: "not_found" };

// Single source of truth for "arm/clear the pending Applied? confirmation" on a
// role (used by the RB-010/012 server action, slice 5 wires it). Convention:
// a Supabase error throws; an update that touches no row (role missing, or no
// longer open) returns ok:false with one generic reason — deliberately simpler
// than apply-role.ts's two-reason split.
export async function setApplyClicked(
  supabase: SupabaseClient,
  uid: string,
  roleId: string,
  nowIso: string,
): Promise<ApplyClickedResult> {
  const { data: role, error: roleError } = await supabase
    .from("roles_public")
    .select("id")
    .eq("id", roleId)
    .eq("lifecycle", "open")
    .maybeSingle();
  if (roleError) throw new Error(`role lookup failed: ${roleError.message}`);
  if (!role) return { ok: false, reason: "not_found" };
  const { error } = await supabase.from("user_roles").upsert(
    { user_id: uid, role_id: roleId, apply_clicked_at: nowIso, updated_at: nowIso },
    { onConflict: "user_id,role_id" },
  );
  if (error) throw new Error(`apply intent update failed: ${error.message}`);
  return { ok: true };
}

export async function clearApplyClicked(
  supabase: SupabaseClient,
  uid: string,
  roleId: string,
  nowIso: string = new Date().toISOString(),
): Promise<ApplyClickedResult> {
  const { error } = await supabase.from("user_roles").upsert(
    { user_id: uid, role_id: roleId, apply_clicked_at: null, updated_at: nowIso },
    { onConflict: "user_id,role_id" },
  );
  if (error) throw new Error(`apply intent update failed: ${error.message}`);
  return { ok: true };
}

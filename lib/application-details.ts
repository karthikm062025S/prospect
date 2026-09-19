import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppStatus } from "./types";

export type SetStatusResult = { ok: true } | { ok: false; reason: "not_found" };

// The ONE writer of applications.status (TRD §3): stamps status_changed_at
// ONLY when status actually changes (RB-026), so a same-status write (a
// detail-pane save that didn't touch status, S7) never resets the ghosting
// clock. Called by the detail-pane status select (S7) and the MCP
// update_status tool.
export async function setApplicationStatus(
  supabase: SupabaseClient,
  uid: string,
  applicationId: string,
  status: AppStatus,
  nowIso: string,
): Promise<SetStatusResult> {
  const { data: existing, error: findError } = await supabase
    .from("applications")
    .select("status")
    .eq("id", applicationId)
    .eq("user_id", uid)
    .maybeSingle();
  if (findError) throw new Error(`application lookup failed: ${findError.message}`);
  if (!existing) return { ok: false, reason: "not_found" };

  const prevStatus = existing.status as AppStatus;
  const patch: Record<string, unknown> = { status, updated_at: nowIso };
  if (status !== prevStatus) patch.status_changed_at = nowIso;

  const { error: updateError } = await supabase
    .from("applications")
    .update(patch)
    .eq("id", applicationId)
    .eq("user_id", uid);
  if (updateError) throw new Error(`application status update failed: ${updateError.message}`);
  return { ok: true };
}

// --- S7: the detail-pane field writes (RB-022/023) -------------------------
// The four editable detail fields. Anything else in the patch is dropped —
// status has ONE writer (above), and status_changed_at is never stamped
// here, so a notes/resume/follow-up edit can never reset the ghosting clock
// (RB-026). Empty strings clear the field (null); follow_up_at is a
// `date` column and must be YYYY-MM-DD.
export type DetailsPatch = {
  notes?: string | null;
  resume_file?: string | null;
  follow_up_at?: string | null;
  next_action?: string | null;
};
const DETAIL_KEYS = ["notes", "resume_file", "follow_up_at", "next_action"] as const;

export type UpdateDetailsResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "empty_patch" | "invalid_date" };

export async function updateApplicationDetails(
  supabase: SupabaseClient,
  uid: string,
  applicationId: string,
  patch: DetailsPatch,
  nowIso: string,
): Promise<UpdateDetailsResult> {
  const update: Record<string, unknown> = {};
  for (const key of DETAIL_KEYS) {
    if (!(key in patch)) continue;
    const raw = patch[key];
    const value = typeof raw === "string" ? raw.trim() : raw;
    update[key] = value === "" || value === undefined ? null : value;
  }
  if (Object.keys(update).length === 0) return { ok: false, reason: "empty_patch" };
  if (update.follow_up_at !== undefined && update.follow_up_at !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(update.follow_up_at))) {
    return { ok: false, reason: "invalid_date" };
  }
  update.updated_at = nowIso;

  const { data, error } = await supabase
    .from("applications")
    .update(update)
    .eq("id", applicationId)
    .eq("user_id", uid)
    .select("id");
  if (error) throw new Error(`application details update failed: ${error.message}`);
  if (!data || data.length === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Application } from "./types";

export type LogApplicationInput = {
  company: string;
  role: string;
  date_applied?: string;
  resume_file?: string;
  visa_flag?: string;
  jd_link?: string;
  notes?: string;
};

// Single source of truth for "log an application": used by the dashboard's
// server action, the Applied-from-drop action, and the log_application MCP
// tool. Looks the company up by name (created as a one-off, unwatched, if it
// doesn't exist yet); if the company is being watched, flips it to
// applied_lock so the watcher never re-surfaces it (the no-double-work rule).
// Creation IS the first status set, so the insert stamps status_changed_at
// (RB-026 — the migration only backfilled pre-existing rows; a null here
// would make the stale badge impossible for every new application). The
// one-writer rule (TRD §3) stays honest: this is the only insert path, and
// every later change still goes through setApplicationStatus.
export async function logApplication(
  supabase: SupabaseClient,
  uid: string,
  input: LogApplicationInput,
  nowIso: string = new Date().toISOString(),
): Promise<Application> {
  const name = input.company.trim();
  const role = input.role.trim();
  if (!name) throw new Error("company is required");
  if (!role) throw new Error("role is required");

  // Escape LIKE metacharacters so "S&P_Global" style names match literally.
  const likeSafeName = name.replace(/[\\%_]/g, "\\$&");
  const { data: existing, error: findError } = await supabase
    .from("companies")
    .select("id, watch_status, is_watched")
    .ilike("name", likeSafeName)
    .maybeSingle();
  if (findError) throw new Error(`company lookup failed: ${findError.message}`);

  let companyId: string;
  if (existing) {
    companyId = existing.id;
    if (existing.is_watched && existing.watch_status !== "applied_lock") {
      const { error: flipError } = await supabase
        .from("companies")
        .update({ watch_status: "applied_lock" })
        .eq("id", companyId);
      if (flipError) throw new Error(`applied_lock flip failed: ${flipError.message}`);
    }
  } else {
    const { data: created, error: createError } = await supabase
      .from("companies")
      .insert({ name, is_watched: false })
      .select("id")
      .single();
    if (createError) throw new Error(`company create failed: ${createError.message}`);
    companyId = created.id;
  }

  const { data: application, error: insertError } = await supabase
    .from("applications")
    .insert({
      user_id: uid,
      company_id: companyId,
      role,
      date_applied: input.date_applied || undefined,
      resume_file: input.resume_file || null,
      visa_flag: input.visa_flag || null,
      jd_link: input.jd_link || null,
      notes: input.notes || null,
      status_changed_at: nowIso,
    })
    .select("*")
    .single();
  if (insertError) throw new Error(`application create failed: ${insertError.message}`);

  return application;
}

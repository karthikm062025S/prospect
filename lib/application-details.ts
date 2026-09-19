import type { QueryFn } from "./db";
import type { AppStatus } from "./types";

export type SetStatusResult = { ok: true } | { ok: false; reason: "not_found" };

// The ONE writer of applications.status (TRD §3): stamps status_changed_at
// ONLY when status actually changes (RB-026), so a same-status write (a
// detail-pane save that didn't touch status, S7) never resets the ghosting
// clock. Called by the detail-pane status select (S7) and the MCP
// update_status tool.
export async function setApplicationStatus(
  q: QueryFn,
  uid: string,
  applicationId: string,
  status: AppStatus,
  nowIso: string,
): Promise<SetStatusResult> {
  const [existing] = await q<{ status: AppStatus }>(
    "select status from applications where id = $1 and user_id = $2",
    [applicationId, uid],
    "applications",
  );
  if (!existing) return { ok: false, reason: "not_found" };

  const changed = status !== existing.status;
  await q(
    `update applications
        set status = $3, updated_at = $4, status_changed_at = case when $5::boolean then $4::timestamptz else status_changed_at end
      where id = $1 and user_id = $2`,
    [applicationId, uid, status, nowIso, changed],
    "applications",
  );
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
  q: QueryFn,
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

  // Column names come from DETAIL_KEYS (+ updated_at) only, never from the caller.
  const keys = Object.keys(update);
  const sets = keys.map((key, i) => `${key} = $${i + 3}`).join(", ");
  const rows = await q<{ id: string }>(
    `update applications set ${sets} where id = $1 and user_id = $2 returning id`,
    [applicationId, uid, ...keys.map((key) => update[key])],
    "applications",
  );
  if (rows.length === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}

import type { QueryFn } from "./db";
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

// One (user_id, role_id) row per user per role; a repeat write updates only
// the columns it carries (the PostgREST partial-upsert semantics every
// user_roles writer relied on).
const STAMP_CLICK = `insert into user_roles (user_id, role_id, apply_clicked_at, updated_at)
  values ($1, $2, $3, $4)
  on conflict (user_id, role_id) do update set apply_clicked_at = excluded.apply_clicked_at, updated_at = excluded.updated_at`;

// Single source of truth for "arm/clear the pending Applied? confirmation" on a
// role (used by the RB-010/012 server action, slice 5 wires it). Convention:
// a DB error throws; a role that is missing or no longer open returns ok:false
// with one generic reason — deliberately simpler than apply-role.ts's
// two-reason split.
export async function setApplyClicked(q: QueryFn, uid: string, roleId: string, nowIso: string): Promise<ApplyClickedResult> {
  const [role] = await q<{ id: string }>(
    "select id from roles_public where id = $1 and lifecycle = 'open'",
    [roleId],
    "roles_public",
  );
  if (!role) return { ok: false, reason: "not_found" };
  await q(STAMP_CLICK, [uid, roleId, nowIso, nowIso], "user_roles");
  return { ok: true };
}

export async function clearApplyClicked(
  q: QueryFn,
  uid: string,
  roleId: string,
  nowIso: string = new Date().toISOString(),
): Promise<ApplyClickedResult> {
  await q(STAMP_CLICK, [uid, roleId, null, nowIso], "user_roles");
  return { ok: true };
}

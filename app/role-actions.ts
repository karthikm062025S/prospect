"use server";

import { after } from "next/server";
import { query, withTransaction } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { applyToRole, applyResultError } from "@/lib/apply-role";
import { captureRoleJdServer } from "@/lib/jd-capture-server";
import type { RoleJd } from "@/lib/role-jd";
import { GENERIC_ERROR, publicError } from "@/lib/types";
import { CORRECTION_FIELDS, parseCorrection, saveCorrection, removeCorrection, type CorrectionField } from "@/lib/corrections";

export type ActionResult = { ok: true } | { ok: false; error: string };

// The user never sees an internal error string: a DB message ("DB_QUERY_FAILED
// (user_roles): ...") or a raw network error is noise to them and detail to an
// attacker. One friendly line for them, the real error in the server log for us.
function failed(err: unknown): ActionResult {
  console.error("action", err);
  return { ok: false, error: GENERIC_ERROR };
}

export async function getRoleJdAction(roleId: string, opts?: { force?: boolean }): Promise<RoleJd> {
  const uid = await requireUser();
  void uid;
  if (!roleId) return { html: null, captured_at: null, error: "missing role id", location: null };
  let data: { jd_snapshot: string | null; jd_snapshot_at: string | null; location: string | null } | undefined;
  try {
    [data] = await query<{ jd_snapshot: string | null; jd_snapshot_at: string | null; location: string | null }>(
      "select jd_snapshot, jd_snapshot_at, location from roles_public where id = $1",
      [roleId],
      "roles_public",
    );
  } catch (err) {
    // The raw DB message stays in the server log (publicError), never in the pane.
    return { html: null, captured_at: null, error: publicError((err as Error).message), location: null };
  }
  if (!data) return { html: null, captured_at: null, error: "role not found", location: null };
  // note: any signed-in user can trigger a capture; force is honoured only when the
  // cached snapshot is older than a day so one client cannot hammer employer pages (audit M1).
  const staleMs = 24 * 60 * 60 * 1000;
  const fresh =
    !!data.jd_snapshot_at && Date.now() - new Date(data.jd_snapshot_at).getTime() < staleMs;
  if (data.jd_snapshot && (!opts?.force || fresh)) {
    return {
      html: data.jd_snapshot,
      captured_at: data.jd_snapshot_at,
      error: null,
      location: data.location,
    };
  }
  // The client's `force` (the pane's "Retry capture") is forwarded, but the
  // ceiling that answers SR-004 is enforced server-side in ensureRoleJd: a
  // stored snapshot re-captures at most once a day, a stored failure at most
  // once every 10 minutes. A never-attempted role still gets its one capture.
  const captured = await captureRoleJdServer(roleId, { force: opts?.force });
  return { ...captured, error: publicError(captured.error) };
}

// One (user_id, role_id) row per user per role; the repeat write updates ONLY
// the flag it carries (saved_at OR hidden_at) plus updated_at, never the other.
async function stampRole(
  uid: string,
  roleId: string,
  column: "saved_at" | "hidden_at",
  value: string | null,
): Promise<ActionResult> {
  try {
    const now = new Date().toISOString();
    await query(
      `insert into user_roles (user_id, role_id, ${column}, updated_at)
       values ($1, $2, $3, $4)
       on conflict (user_id, role_id) do update set ${column} = excluded.${column}, updated_at = excluded.updated_at`,
      [uid, roleId, value, now],
      "user_roles",
    );
    return { ok: true };
  } catch (err) {
    return failed(err);
  }
}

// PERF (v7 S4, app-functional lane): these two do NOT revalidatePath("/").
// Home is force-dynamic over the whole 1,293-row feed, so ONE revalidate makes
// the action response carry the entire re-serialised list — measured 791,727
// bytes per save/hide against the production build (scripts in the handoff
// ledger). The only thing that changed is this user's one user_roles row, and
// components/home-list.tsx already holds that change client-side until the next
// real read of "/", so the payload bought nothing.
export async function saveRoleAction(roleId: string, saved: boolean): Promise<ActionResult> {
  const uid = await requireUser();
  if (!roleId) return { ok: false, error: "missing role id" };
  return stampRole(uid, roleId, "saved_at", saved ? new Date().toISOString() : null);
}

export async function hideRoleAction(roleId: string, hidden: boolean): Promise<ActionResult> {
  const uid = await requireUser();
  if (!roleId) return { ok: false, error: "missing role id" };
  return stampRole(uid, roleId, "hidden_at", hidden ? new Date().toISOString() : null);
}

export async function markAlreadyAppliedAction(roleId: string): Promise<ActionResult> {
  const uid = await requireUser();
  if (!roleId) return { ok: false, error: "missing role id" };
  try {
    // Same transaction as app/actions.ts confirmAppliedAction: check + insert +
    // link are atomic, and the guarded link closes the L8 race.
    const result = await withTransaction((q) => applyToRole(q, uid, roleId));
    if (!result.ok) return { ok: false, error: applyResultError(result.reason) };
    if (!result.application.jd_snapshot) {
      const applicationId = result.application.id;
      after(async () => {
        const captured = await captureRoleJdServer(roleId);
        if (!captured.html) return;
        try {
          await query(
            "update applications set jd_snapshot = $1, jd_snapshot_at = $2 where id = $3 and user_id = $4",
            [captured.html, captured.captured_at, applicationId, uid],
            "applications",
          );
        } catch (err) {
          console.error(JSON.stringify({ lane: "jd-wiring", application_id: applicationId, role_id: roleId, error: err instanceof Error ? err.message : String(err) }));
        }
      });
    }
  } catch (err) {
    return failed(err);
  }
  // Nothing is revalidated. This action fires from HOME, and Next refreshes the
  // page the action was called FROM whenever any revalidatePath runs — measured
  // 791,736 bytes of re-serialised Home feed for this one call, even though the
  // path named is /applications. It buys nothing: /applications is
  // force-dynamic and `staleTimes.dynamic` defaults to 0 (next.config.ts sets
  // none), so a dynamic route is never served from the client Router Cache —
  // every navigation to it is a server round trip that re-reads the row this
  // action just wrote. The badge moves at the click via
  // components/week-count.tsx bumpWeekCount.
  return { ok: true };
}

// T5 (K1): a per-user correction, never a write to the shared roles row.
// Same PERF note as saveRoleAction/hideRoleAction above — no revalidatePath("/");
// L5 patches the client view optimistically and the next real Home load reads
// the row (via app/(app)/page.tsx's role_corrections read + overlayCorrections).
export async function correctRoleAction(roleId: string, field: string, value: string): Promise<ActionResult> {
  const uid = await requireUser();
  const parsed = parseCorrection({ roleId, field, value });
  if (!parsed) return { ok: false, error: "invalid correction" };
  try {
    await saveCorrection(
      query,
      uid,
      { role_id: parsed.roleId, field: parsed.field, value: parsed.value },
      new Date().toISOString(),
    );
    return { ok: true };
  } catch (err) {
    return failed(err);
  }
}

export async function uncorrectRoleAction(roleId: string, field: string): Promise<ActionResult> {
  const uid = await requireUser();
  if (!roleId) return { ok: false, error: "missing role id" };
  if (!(CORRECTION_FIELDS as readonly string[]).includes(field)) return { ok: false, error: "invalid correction" };
  try {
    await removeCorrection(query, uid, roleId, field as CorrectionField);
    return { ok: true };
  } catch (err) {
    return failed(err);
  }
}

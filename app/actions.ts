"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { query, withTransaction } from "@/lib/db";
import { unlinkLegacyRolePointer } from "@/lib/application-delete-server";
import { requireUser } from "@/lib/require-user";
import { setApplyClicked, clearApplyClicked } from "@/lib/apply-intent";
import { applyToRole, applyResultError } from "@/lib/apply-role";
import {
  captureRoleJdServer,
  captureUnlinkedApplicationJdServer,
} from "@/lib/jd-capture-server";
import {
  setApplicationStatus,
  updateApplicationDetails,
  type DetailsPatch,
} from "@/lib/application-details";
import { GENERIC_ERROR, publicError, type AppStatus } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type JdCaptureResult = { ok: true } | { ok: false; error: string };

// The user never sees an internal error string: a DB message ("DB_QUERY_FAILED
// (applications): ...") or a raw network error is noise to them and detail to
// an attacker. One friendly line for them, the real error in the server log for us.
function failed(err: unknown): ActionResult {
  console.error("action", err);
  return { ok: false, error: GENERIC_ERROR };
}

// The apply-time JD copy (after the response): a role's snapshot captured after
// the application row was created lands on that application too.
async function copyRoleJdToApplication(uid: string, roleId: string, applicationId: string): Promise<void> {
  const captured = await captureRoleJdServer(roleId);
  if (!captured.html) return;
  try {
    await query(
      "update applications set jd_snapshot = $1, jd_snapshot_at = $2 where id = $3 and user_id = $4",
      [captured.html, captured.captured_at, applicationId, uid],
      "applications",
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        lane: "jd-wiring",
        application_id: applicationId,
        role_id: roleId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

export async function armApplyIntentAction(
  roleId: string,
): Promise<ActionResult> {
  const uid = await requireUser();
  if (!roleId) return { ok: false, error: "missing role id" };
  try {
    const result = await setApplyClicked(
      query,
      uid,
      roleId,
      new Date().toISOString(),
    );
    if (!result.ok) return { ok: false, error: "role is no longer open" };
  } catch (err) {
    return failed(err);
  }
  // No revalidatePath("/"): see the note on saveRoleAction in
  // app/role-actions.ts — Home is force-dynamic over the whole feed, so one
  // revalidate re-serialises 1,293 rows (791,727 bytes measured) into the
  // action response, and components/home-list.tsx already holds this change.
  return { ok: true };
}

export async function applyNotYetAction(roleId: string): Promise<ActionResult> {
  const uid = await requireUser();
  if (!roleId) return { ok: false, error: "missing role id" };
  try {
    await clearApplyClicked(query, uid, roleId);
  } catch (err) {
    return failed(err);
  }
  // No revalidatePath("/"): see the note on saveRoleAction in
  // app/role-actions.ts — Home is force-dynamic over the whole feed, so one
  // revalidate re-serialises 1,293 rows (791,727 bytes measured) into the
  // action response, and components/home-list.tsx already holds this change.
  return { ok: true };
}

export async function confirmAppliedAction(
  roleId: string,
): Promise<ActionResult> {
  const uid = await requireUser();
  if (!roleId) return { ok: false, error: "missing role id" };
  try {
    // One transaction: the existing-link check, the application insert and the
    // user_roles link commit together or not at all (the L8 race is closed by
    // the guarded link in lib/apply-role.ts).
    const result = await withTransaction((q) => applyToRole(q, uid, roleId));
    if (!result.ok) {
      return { ok: false, error: applyResultError(result.reason) };
    }
    if (!result.application.jd_snapshot) {
      const applicationId = result.application.id;
      after(() => copyRoleJdToApplication(uid, roleId, applicationId));
    }
  } catch (err) {
    return failed(err);
  }
  // No revalidatePath("/"): see the note on saveRoleAction in
  // app/role-actions.ts — Home is force-dynamic over the whole feed, so one
  // revalidate re-serialises 1,293 rows (791,727 bytes measured) into the
  // action response, and components/home-list.tsx already holds this change.
  // Not revalidated either. This action fires from HOME, and Next refreshes the
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

export async function recaptureJdAction(
  applicationId: string,
): Promise<JdCaptureResult> {
  const uid = await requireUser();
  if (!applicationId) return { ok: false, error: "missing application id" };
  let application: { id: string; company_id: string; role_id: string | null; jd_link: string | null } | undefined;
  try {
    [application] = await query<{ id: string; company_id: string; role_id: string | null; jd_link: string | null }>(
      "select id, company_id, role_id, jd_link from applications where id = $1 and user_id = $2",
      [applicationId, uid],
      "applications",
    );
  } catch (err) {
    console.error("recaptureJd find", err);
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!application) return { ok: false, error: "application not found" };

  const captured = application.role_id
    ? await captureRoleJdServer(application.role_id, { force: true })
    : await captureUnlinkedApplicationJdServer({
        applicationId,
        companyId: application.company_id,
        link: application.jd_link,
      });
  // Never the raw capture/DB string: publicError logs it and returns one line.
  if (!captured.html)
    return { ok: false, error: publicError(captured.error) ?? GENERIC_ERROR };

  try {
    await query(
      "update applications set jd_snapshot = $1, jd_snapshot_at = $2 where id = $3 and user_id = $4",
      [captured.html, captured.captured_at, applicationId, uid],
      "applications",
    );
  } catch (err) {
    console.error("recaptureJd store", err);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath("/applications");
  return { ok: true };
}

export async function deleteRolesAction(
  roleIds: string[],
): Promise<ActionResult> {
  const uid = await requireUser();
  const ids = [...new Set(roleIds.filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "nothing selected" };
  try {
    const now = new Date().toISOString();
    await query(
      `insert into user_roles (user_id, role_id, deleted_at, updated_at)
       select $1, unnest($2::uuid[]), $3::timestamptz, $3::timestamptz
       on conflict (user_id, role_id) do update set deleted_at = excluded.deleted_at, updated_at = excluded.updated_at`,
      [uid, ids, now],
      "user_roles",
    );
  } catch (err) {
    return failed(err);
  }
  // No revalidatePath("/"): see the note on saveRoleAction in
  // app/role-actions.ts — Home is force-dynamic over the whole feed, so one
  // revalidate re-serialises 1,293 rows (791,727 bytes measured) into the
  // action response, and components/home-list.tsx already holds this change.
  return { ok: true };
}

const PIPELINE_STATUSES: AppStatus[] = [
  "applied",
  "oa",
  "interviewing",
  "offer",
  "rejected",
];

export async function setApplicationStatusAction(
  applicationId: string,
  status: AppStatus,
): Promise<ActionResult> {
  const uid = await requireUser();
  if (!applicationId) return { ok: false, error: "missing application id" };
  if (!PIPELINE_STATUSES.includes(status))
    return { ok: false, error: "invalid status" };
  try {
    const result = await setApplicationStatus(
      query,
      uid,
      applicationId,
      status,
      new Date().toISOString(),
    );
    if (!result.ok) return { ok: false, error: "application not found" };
  } catch (err) {
    return failed(err);
  }
  revalidatePath("/applications");
  return { ok: true };
}

export async function updateApplicationDetailsAction(
  applicationId: string,
  patch: DetailsPatch,
): Promise<ActionResult> {
  const uid = await requireUser();
  if (!applicationId) return { ok: false, error: "missing application id" };
  try {
    const result = await updateApplicationDetails(
      query,
      uid,
      applicationId,
      patch,
      new Date().toISOString(),
    );
    if (!result.ok) {
      return {
        ok: false,
        error:
          result.reason === "invalid_date"
            ? "date must be YYYY-MM-DD"
            : result.reason === "not_found"
              ? "application not found"
              : "nothing to save",
      };
    }
  } catch (err) {
    return failed(err);
  }
  revalidatePath("/applications");
  return { ok: true };
}

export async function deleteApplicationAction(
  applicationId: string,
): Promise<ActionResult> {
  const uid = await requireUser();
  if (!applicationId) return { ok: false, error: "missing application id" };
  try {
    // One transaction: find (locked) -> unlink the legacy roles pointer -> delete
    // -> restore the user_roles row. A failure anywhere leaves every row as it was.
    const found = await withTransaction(async (q) => {
      const [application] = await q<{ id: string; role_id: string | null }>(
        "select id, role_id from applications where id = $1 and user_id = $2 for update",
        [applicationId, uid],
        "applications",
      );
      if (!application) return false;

      await unlinkLegacyRolePointer(q, applicationId);
      await q("delete from applications where id = $1 and user_id = $2", [applicationId, uid], "applications");

      if (application.role_id) {
        await q(
          `update user_roles set application_id = null, apply_clicked_at = null, updated_at = $3
            where user_id = $1 and role_id = $2`,
          [uid, application.role_id, new Date().toISOString()],
          "user_roles",
        );
      }
      return true;
    });
    if (!found) return { ok: false, error: "application not found" };
  } catch (err) {
    return failed(err);
  }
  revalidatePath("/applications");
  // No revalidatePath("/"): see the note on saveRoleAction in
  // app/role-actions.ts — Home is force-dynamic over the whole feed, so one
  // revalidate re-serialises 1,293 rows (791,727 bytes measured) into the
  // action response, and components/home-list.tsx already holds this change.
  return { ok: true };
}

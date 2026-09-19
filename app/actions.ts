"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

// The user never sees an internal error string: a Supabase/PostgREST message
// ("new row violates row-level security policy for ...") or a raw network error
// is noise to them and detail to an attacker. One friendly line for them, the
// real error in the server log for us.
function failed(err: unknown): ActionResult {
  console.error("action", err);
  return { ok: false, error: GENERIC_ERROR };
}

export async function armApplyIntentAction(
  roleId: string,
): Promise<ActionResult> {
  const uid = await requireUser();
  if (!roleId) return { ok: false, error: "missing role id" };
  try {
    const supabase = await createClient();
    const result = await setApplyClicked(
      supabase,
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
    const supabase = await createClient();
    await clearApplyClicked(supabase, uid, roleId);
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
    const supabase = await createClient();
    // ponytail: applyToRole's existing-link check + application insert are two
    // round trips, not one transaction — two confirms landing on the same role
    // at once can both pass the check and both insert, orphaning the first
    // application (L8 audit). Ceiling: fine while applies are human-paced,
    // one per click. Upgrade: a unique partial index on
    // user_roles(application_id) where application_id is not null, or wrap
    // the check + insert in `select ... for update`.
    const result = await applyToRole(supabase, uid, roleId);
    if (!result.ok) {
      return { ok: false, error: applyResultError(result.reason) };
    }
    if (!result.application.jd_snapshot) {
      const applicationId = result.application.id;
      after(async () => {
        const captured = await captureRoleJdServer(roleId);
        if (!captured.html) return;
        const { error } = await supabase
          .from("applications")
          .update({
            jd_snapshot: captured.html,
            jd_snapshot_at: captured.captured_at,
          })
          .eq("id", applicationId)
          .eq("user_id", uid);
        if (error) {
          console.error(
            JSON.stringify({
              lane: "jd-wiring",
              application_id: applicationId,
              role_id: roleId,
              error: error.message,
            }),
          );
        }
      });
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
  const supabase = await createClient();
  const { data: application, error } = await supabase
    .from("applications")
    .select("id, company_id, role_id, jd_link")
    .eq("id", applicationId)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) return { ok: false, error: GENERIC_ERROR };
  if (!application) return { ok: false, error: "application not found" };

  const captured = application.role_id
    ? await captureRoleJdServer(application.role_id, { force: true })
    : await captureUnlinkedApplicationJdServer({
        applicationId,
        companyId: application.company_id,
        link: application.jd_link,
      });
  // Never the raw capture/PostgREST string: publicError logs it and returns one line.
  if (!captured.html)
    return { ok: false, error: publicError(captured.error) ?? GENERIC_ERROR };

  const { error: storeError } = await supabase
    .from("applications")
    .update({
      jd_snapshot: captured.html,
      jd_snapshot_at: captured.captured_at,
    })
    .eq("id", applicationId)
    .eq("user_id", uid);
  if (storeError) {
    console.error("recaptureJd store", storeError);
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
    const supabase = await createClient();
    const now = new Date().toISOString();
    const { error } = await supabase.from("user_roles").upsert(
      ids.map((roleId) => ({
        user_id: uid,
        role_id: roleId,
        deleted_at: now,
        updated_at: now,
      })),
      { onConflict: "user_id,role_id" },
    );
    if (error) return { ok: false, error: GENERIC_ERROR };
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
    const supabase = await createClient();
    const result = await setApplicationStatus(
      supabase,
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
    const supabase = await createClient();
    const result = await updateApplicationDetails(
      supabase,
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
    const supabase = await createClient();
    const { data: application, error: findError } = await supabase
      .from("applications")
      .select("id, role_id")
      .eq("id", applicationId)
      .eq("user_id", uid)
      .maybeSingle();
    if (findError) {
      console.error("deleteApplication find", findError);
      return { ok: false, error: GENERIC_ERROR };
    }
    if (!application) return { ok: false, error: "application not found" };

    const unlinkError = await unlinkLegacyRolePointer(applicationId);
    if (unlinkError) {
      console.error("deleteApplication unlink role", unlinkError);
      return { ok: false, error: GENERIC_ERROR };
    }

    const { error: deleteError } = await supabase
      .from("applications")
      .delete()
      .eq("id", applicationId)
      .eq("user_id", uid);
    if (deleteError) {
      console.error("deleteApplication delete", deleteError);
      return { ok: false, error: GENERIC_ERROR };
    }

    if (application.role_id) {
      const { error: roleError } = await supabase
        .from("user_roles")
        .update({
          application_id: null,
          apply_clicked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", uid)
        .eq("role_id", application.role_id);
      if (roleError) {
        console.error("deleteApplication role restore", roleError);
        return { ok: false, error: GENERIC_ERROR };
      }
    }
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

"use server";

// A15 / D24 on the Applications side: the captured posting is fetched ON
// DEMAND for the selected application, never shipped in the page payload.
// Same contract as app/role-actions.ts getRoleJdAction — user-checked, and it
// RETURNS a result instead of throwing so a failure can't blow away the pane.
import { query } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { fetchApplicationJd, type ApplicationJd } from "@/lib/application-jd";

export async function getApplicationJdAction(applicationId: string): Promise<ApplicationJd> {
  const uid = await requireUser();
  if (!applicationId) return { html: null, captured_at: null };
  try {
    return await fetchApplicationJd(query, uid, applicationId);
  } catch (err) {
    // Named in the server log; the pane shows its "nothing captured" state.
    console.error("getApplicationJd", err);
    return { html: null, captured_at: null };
  }
}

"use server";

// A15 / D24 on the Applications side: the captured posting is fetched ON
// DEMAND for the selected application, never shipped in the page payload.
// Same contract as app/role-actions.ts getRoleJdAction — user-checked, and it
// RETURNS a result instead of throwing so a failure can't blow away the pane.
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/require-user";
import { fetchApplicationJd, type ApplicationJd } from "@/lib/application-jd";

export async function getApplicationJdAction(applicationId: string): Promise<ApplicationJd> {
  const uid = await requireUser();
  if (!applicationId) return { html: null, captured_at: null };
  const supabase = await createClient();
  return fetchApplicationJd(supabase, uid, applicationId);
}

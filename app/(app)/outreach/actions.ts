"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { OUTREACH_STATUSES } from "@/lib/types";
import { insertOutreach, parseOutreachChannel, setOutreachStatus } from "@/lib/outreach";

export async function addOutreachAction(formData: FormData) {
  const uid = await requireUser();
  const contact_name = String(formData.get("contact_name") ?? "").trim();
  const company_name = String(formData.get("company_name") ?? "").trim();
  if (!contact_name || !company_name) return; // both are the minimum useful row

  // L8 audit item 4d: the <select> in app/(app)/outreach/page.tsx only offers
  // linkedin/email, but this action is a trust boundary in its own right — a
  // raw POST could send anything. Reject rather than silently store it.
  const channelInput = String(formData.get("channel") ?? "linkedin");
  const channel = parseOutreachChannel(channelInput);
  if (!channel) {
    throw new Error(`Unsupported outreach channel "${channelInput}". Use linkedin or email.`);
  }

  await insertOutreach(query, uid, {
    company_name,
    contact_name,
    channel,
    role_label: String(formData.get("role_label") ?? ""),
    contact_title: String(formData.get("contact_title") ?? ""),
    contact_handle: String(formData.get("contact_handle") ?? ""),
    message: String(formData.get("message") ?? ""),
    follow_up_at: String(formData.get("follow_up_at") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  revalidatePath("/outreach");
}

export async function setOutreachStatusAction(formData: FormData) {
  const uid = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !(OUTREACH_STATUSES as readonly string[]).includes(status)) return;

  await setOutreachStatus(query, uid, id, status);
  revalidatePath("/outreach");
}

export async function deleteOutreachAction(formData: FormData) {
  const uid = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await query("delete from outreach where id = $1 and user_id = $2", [id, uid], "outreach");
  revalidatePath("/outreach");
}

export async function deleteOutreachesAction(formData: FormData) {
  const uid = await requireUser();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (ids.length === 0) return;
  await query("delete from outreach where id = any($1::uuid[]) and user_id = $2", [ids, uid], "outreach");
  revalidatePath("/outreach");
}

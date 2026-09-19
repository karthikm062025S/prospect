"use server";

// Manual Timeline entries. They share the application_events table under the
// EXISTING 'other' kind — no widened CHECK constraint, so the feature works on
// the live schema instead of waiting on a migration. Written rows carry
// classified_by = 'user'; the owner predicate and author marker are re-checked
// server-side before a row can be read or removed.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/require-user";
import type { ActionResult } from "@/app/actions";
import { GENERIC_ERROR } from "@/lib/types";

// A date input gives `YYYY-MM-DD` with no time. Noon avoids the midnight wrap
// that turns "today" into "yesterday" one timezone over, and the zone is the
// app's ONE fixed zone rather than the server's — a row written from a Vercel
// box in UTC must land on the same calendar day the reader picked.
// (Same longOffset shortcut as lib/mcp-helpers.ts: wrong only in the exact
// minute of a DST changeover, at noon, which cannot happen.)
function nyNoonOf(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const probe = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(probe.getTime())) return null;
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" })
      .formatToParts(probe)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || "-05:00";
  const at = new Date(`${date}T12:00:00${offset}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export async function addTimelineEntryAction(
  applicationId: string,
  entry: { text: string; date: string },
): Promise<ActionResult> {
  const uid = await requireUser();
  if (!applicationId) return { ok: false, error: "missing application id" };
  const text = entry.text.trim();
  if (!text) return { ok: false, error: "write something first" };
  const receivedAt = nyNoonOf(entry.date);
  if (!receivedAt) return { ok: false, error: "invalid date" };

  try {
    const supabase = await createClient();
    const { data: app, error: findError } = await supabase
      .from("applications")
      .select("id, company_id")
      .eq("id", applicationId)
      .eq("user_id", uid)
      .maybeSingle();
    if (findError) {
      console.error("addTimelineEntry find", findError);
      return { ok: false, error: GENERIC_ERROR };
    }
    if (!app) return { ok: false, error: "application not found" };

    const { error } = await supabase.from("application_events").insert({
      user_id: uid,
      application_id: applicationId,
      company_id: app.company_id,
      kind: "other",
      subject: text.slice(0, 200),
      snippet: text,
      sender: "you",
      received_at: receivedAt,
      classified_by: "user",
    });
    if (error) {
      console.error("addTimelineEntry insert", error);
      return { ok: false, error: GENERIC_ERROR };
    }
  } catch (err) {
    console.error("addTimelineEntry", err);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath("/applications");
  return { ok: true };
}

export async function deleteTimelineEntryAction(eventId: string): Promise<ActionResult> {
  const uid = await requireUser();
  if (!eventId) return { ok: false, error: "missing event id" };
  try {
    const supabase = await createClient();
    // Scoped delete: the guard is in the WHERE clause, so a concurrent write
    // cannot slip an email row through between a read and the delete.
    const { data, error } = await supabase
      .from("application_events")
      .delete()
      .eq("id", eventId)
      .eq("user_id", uid)
      .eq("classified_by", "user")
      .select("id");
    if (error) {
      console.error("deleteTimelineEntry", error);
      return { ok: false, error: GENERIC_ERROR };
    }
    if (!data || data.length === 0) return { ok: false, error: "only your own entries can be deleted" };
  } catch (err) {
    console.error("deleteTimelineEntry", err);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath("/applications");
  return { ok: true };
}

"use server";

// Manual Timeline entries. They share the application_events table under the
// EXISTING 'other' kind — no widened CHECK constraint, so the feature works on
// the live schema instead of waiting on a migration. Written rows carry
// classified_by = 'user'; the owner predicate and author marker are re-checked
// server-side before a row can be read or removed.
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
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
    const [app] = await query<{ id: string; company_id: string }>(
      "select id, company_id from applications where id = $1 and user_id = $2",
      [applicationId, uid],
      "applications",
    );
    if (!app) return { ok: false, error: "application not found" };

    await query(
      `insert into application_events (user_id, application_id, company_id, kind, subject, snippet, sender, received_at, classified_by)
       values ($1, $2, $3, 'other', $4, $5, 'you', $6, 'user')`,
      [uid, applicationId, app.company_id, text.slice(0, 200), text, receivedAt],
      "application_events",
    );
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
    // Scoped delete: the guard is in the WHERE clause, so a concurrent write
    // cannot slip an email row through between a read and the delete.
    const rows = await query<{ id: string }>(
      "delete from application_events where id = $1 and user_id = $2 and classified_by = 'user' returning id",
      [eventId, uid],
      "application_events",
    );
    if (rows.length === 0) return { ok: false, error: "only your own entries can be deleted" };
  } catch (err) {
    console.error("deleteTimelineEntry", err);
    return { ok: false, error: GENERIC_ERROR };
  }
  revalidatePath("/applications");
  return { ok: true };
}

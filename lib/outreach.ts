import { z } from "zod";
import type { QueryFn } from "./db";
import type { Outreach, OutreachChannel } from "./types";

// Inlined from lib/types.ts rather than imported as a runtime value: node
// --experimental-strip-types (the `npm test` runner) can't resolve an
// extensionless relative VALUE import between lib/*.ts files, and tsc's
// `moduleResolution: bundler` rejects a `.ts`-extension import — the same
// landmine lib/upsert-role.ts's isTargetTitle inlining sidesteps (root
// CLAUDE.md's project mistake rule). Type-only imports are stripped so they
// don't hit this; OUTREACH_STATUSES below is the same story. Keep both in
// sync with lib/types.ts (tests/outreach.test.ts locks the channel list).
const OUTREACH_STATUSES = ["drafted", "sent", "replied", "call", "dead"] as const;
const OUTREACH_CHANNELS = ["linkedin", "email"] as const;

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

// L8 audit item 4d: addOutreachAction's <select> only offers the two real
// channels, but a raw POST to the server action could send anything — this
// is the trust-boundary check. Pure; null means "reject with a friendly
// error" (the caller decides the wording).
const channelSchema = z.enum(OUTREACH_CHANNELS);
export function parseOutreachChannel(value: string): OutreachChannel | null {
  const result = channelSchema.safeParse(value);
  return result.success ? result.data : null;
}

export type InsertOutreachInput = {
  company_name: string;
  contact_name: string;
  channel?: string;
  role_label?: string | null;
  contact_title?: string | null;
  contact_handle?: string | null;
  message?: string | null;
  status?: string | null;
  follow_up_at?: string | null;
  notes?: string | null;
};

// Single source of truth for "record an outreach contact": used by the OUTREACH
// tab's addOutreachAction AND the log_outreach MCP tool, so a contact logged by
// the owner or by an outreach skill lands the same way. company_name + contact_name
// are the minimum useful row; status is only set when a caller passes a valid one
// (otherwise the DB default 'drafted' applies).
export async function insertOutreach(q: QueryFn, uid: string, input: InsertOutreachInput): Promise<Outreach> {
  const company_name = (input.company_name ?? "").trim();
  const contact_name = (input.contact_name ?? "").trim();
  if (!company_name) throw new Error("company_name is required");
  if (!contact_name) throw new Error("contact_name is required");

  const status = clean(input.status);
  const validStatus = status && (OUTREACH_STATUSES as readonly string[]).includes(status) ? status : null;
  const [row] = await q<Outreach>(
    `insert into outreach (user_id, company_name, contact_name, channel, role_label, contact_title, contact_handle, message, follow_up_at, notes, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, coalesce($11::text, 'drafted'))
     returning *`,
    [
      uid,
      company_name,
      contact_name,
      (input.channel ?? "linkedin").trim() || "linkedin",
      clean(input.role_label),
      clean(input.contact_title),
      clean(input.contact_handle),
      clean(input.message),
      clean(input.follow_up_at),
      clean(input.notes),
      validStatus,
    ],
    "outreach",
  );
  return row;
}

// Single source of truth for the status transition + its side effects. Marking
// "sent" stamps the send date and a follow-up 7 days out (~5 business days, the
// researched cadence) unless the row already carries a follow-up the user set by
// hand. Shared by setOutreachStatusAction and the set_outreach_status MCP tool.
// Returns the updated row, or null when no row of this user matches.
export async function setOutreachStatus(q: QueryFn, uid: string, id: string, status: string): Promise<Outreach | null> {
  if (!(OUTREACH_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`invalid status: ${status}`);
  }
  const patch: Record<string, string | null> = { status, updated_at: new Date().toISOString() };
  if (status === "sent") {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    patch.sent_at = today;
    const [existing] = await q<{ follow_up_at: string | null }>(
      "select follow_up_at from outreach where id = $1 and user_id = $2",
      [id, uid],
      "outreach",
    );
    // Advance the follow-up window on every send EXCEPT when the user has a
    // still-future follow_up_at set by hand — don't clobber that. A null or
    // already-spent (<= today) follow_up_at is re-stamped +7 days out, so a
    // second/third send (a follow-up nudge) actually reschedules the next
    // owed-nudge date instead of leaving the contact stuck "due" forever.
    const hasFutureFollowUp = !!existing?.follow_up_at && existing.follow_up_at > today;
    if (!hasFutureFollowUp) {
      patch.follow_up_at = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }
  }
  // Column names are the fixed keys above, never caller input.
  const keys = Object.keys(patch);
  const sets = keys.map((key, i) => `${key} = $${i + 3}`).join(", ");
  const [row] = await q<Outreach>(
    `update outreach set ${sets} where id = $1 and user_id = $2 returning *`,
    [id, uid, ...keys.map((key) => patch[key])],
    "outreach",
  );
  return row ?? null;
}

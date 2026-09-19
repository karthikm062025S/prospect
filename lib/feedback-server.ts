import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

// Server-only: never import from a Client Component (mirrors the guard in
// lib/supabase/service.ts, which this module wraps).
if (typeof window !== "undefined") {
  throw new Error("lib/feedback-server.ts must never reach the client bundle");
}

// sha256(salt:ip) -- keeps raw IPs out of the feedback table/logs while
// still letting the daily cap group requests from the same origin.
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

// feedback_select_own (db/migration-2026-09-v7-public.sql) is owner-only,
// so the SSR client can never count an anonymous submitter's rows, nor
// another signed-in user's, for the per-IP cap. This service-role read is
// the ONE allowed service-client import for the feedback feature (contract
// item 3) -- scoped to a same-UTC-day COUNT only, never returns row content.
export async function countFeedbackToday(params: { userId: string | null; ipHash: string }): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const query = createServiceClient()
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfDay.toISOString());
  const { count, error } = params.userId
    ? await query.eq("user_id", params.userId)
    : await query.eq("ip_hash", params.ipHash);

  if (error) {
    // G1 M2: fail closed. A broken count read reads as "cap reached" rather
    // than as an open door for a flood while the DB is unhappy.
    console.error("feedback count", error);
    return Number.POSITIVE_INFINITY;
  }
  return count ?? 0;
}

/** G1 M2: every sender combined. 200/day keeps the Resend quota and the inbox sane. */
export const FEEDBACK_GLOBAL_DAILY_CAP = 200;

export async function countFeedbackTodayAll(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count, error } = await createServiceClient()
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfDay.toISOString());
  if (error) {
    console.error("feedback global count", error);
    return Number.POSITIVE_INFINITY;
  }
  return count ?? 0;
}

// SR-001: the ONE write path into feedback. The anon INSERT policy is dropped
// (db/migration-2026-09-v7-feedback.addendum.sql), so PostgREST refuses every
// client key and the app's caps in app/feedback-actions.ts are the real
// boundary again. Insert-only: no select, nothing returned but a boolean, so
// the V1 "no row-returning export" contract still holds.
export type FeedbackInsert = {
  user_id: string | null;
  email: string | null;
  page: string;
  message: string;
  user_agent: string;
  ip_hash: string;
};

export async function insertFeedback(row: FeedbackInsert): Promise<{ ok: boolean }> {
  const { error } = await createServiceClient().from("feedback").insert(row);
  if (error) console.error("feedback insert", error);
  return { ok: !error };
}

import { createHash } from "node:crypto";
import { query } from "@/lib/db";

// Server-only: never import from a Client Component (mirrors the guard in
// lib/db.ts, which this module wraps).
if (typeof window !== "undefined") {
  throw new Error("lib/feedback-server.ts must never reach the client bundle");
}

// sha256(salt:ip) -- keeps raw IPs out of the feedback table/logs while
// still letting the daily cap group requests from the same origin.
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function startOfTodayIso(): string {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  return startOfDay.toISOString();
}

// The per-sender daily cap: a same-UTC-day COUNT only, never row content. A
// signed-in sender is counted by user_id, an anonymous one by ip_hash (the
// ip_hash branch is the one feedback read with no user_id in it —
// tests/user-scoping.test.ts allowlist). A failed count throws, named, and
// app/feedback-actions.ts turns it into the generic error: the cap is never
// silently open OR silently closed while the DB is unhappy.
export async function countFeedbackToday(params: { userId: string | null; ipHash: string }): Promise<number> {
  const [row] = params.userId
    ? await query<{ n: number }>(
        "select count(*)::int as n from feedback where created_at >= $1 and user_id = $2",
        [startOfTodayIso(), params.userId],
        "feedback",
      )
    : await query<{ n: number }>(
        "select count(*)::int as n from feedback where created_at >= $1 and ip_hash = $2",
        [startOfTodayIso(), params.ipHash],
        "feedback",
      );
  return row.n;
}

/** G1 M2: every sender combined. 200/day keeps the Resend quota and the inbox sane. */
export const FEEDBACK_GLOBAL_DAILY_CAP = 200;

export async function countFeedbackTodayAll(): Promise<number> {
  const [row] = await query<{ n: number }>(
    "select count(*)::int as n from feedback where created_at >= $1",
    [startOfTodayIso()],
    "feedback",
  );
  return row.n;
}

// SR-001: the ONE write path into feedback. Insert-only: no select, nothing
// returned but a boolean, so the V1 "no row-returning export" contract still
// holds. A rejected insert throws, named.
export type FeedbackInsert = {
  user_id: string | null;
  email: string | null;
  page: string;
  message: string;
  user_agent: string;
  ip_hash: string;
};

export async function insertFeedback(row: FeedbackInsert): Promise<{ ok: boolean }> {
  await query(
    "insert into feedback (user_id, email, page, message, user_agent, ip_hash) values ($1, $2, $3, $4, $5, $6)",
    [row.user_id, row.email, row.page, row.message, row.user_agent, row.ip_hash],
    "feedback",
  );
  return { ok: true };
}

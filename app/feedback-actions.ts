"use server";

import { headers } from "next/headers";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { GENERIC_ERROR } from "@/lib/types";
import { parseFeedback, dailyCapExceeded, sendFeedbackMail } from "@/lib/feedback";
import { FEEDBACK_GLOBAL_DAILY_CAP, countFeedbackToday, countFeedbackTodayAll, hashIp, insertFeedback } from "@/lib/feedback-server";

// D10: the floating feedback box's server action. Unlike every other
// action in this app, signed-out submission is INTENTIONAL (the landing
// and legal pages have no session) -- never call requireUser here.
export type FeedbackState = { ok: null } | { ok: true } | { ok: false; error: string };

function readField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",", 1)[0]?.trim() || null;
}

export async function submitFeedbackAction(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  try {
    const parsed = parseFeedback({
      message: readField(formData, "message"),
      email: readField(formData, "email"),
      page: readField(formData, "page"),
    });
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const { message, email, page } = parsed.value;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id ?? null;

    const headerStore = await headers();
    const ip = firstHeaderValue(headerStore.get("x-forwarded-for")) ?? "unknown";
    // G1 L1: no guessable fallback salt; an unconfigured deploy refuses politely.
    const salt = process.env.FEEDBACK_IP_SALT ?? process.env.MCP_SECRET;
    if (!salt) return { ok: false, error: "Feedback is not set up on this deployment yet." };
    const ipHash = hashIp(ip, salt);

    const [todayCount, todayAll] = await Promise.all([
      countFeedbackToday({ userId: uid, ipHash }),
      countFeedbackTodayAll(),
    ]);
    if (todayAll >= FEEDBACK_GLOBAL_DAILY_CAP) {
      return { ok: false, error: "Feedback is closed for today. Try again tomorrow." };
    }
    if (dailyCapExceeded(todayCount)) {
      return { ok: false, error: "Thanks, that's plenty for today. Try again tomorrow." };
    }

    const userAgent = (headerStore.get("user-agent") ?? "").slice(0, 300);

    // SR-001: written with the service role AFTER the caps above, because the
    // table no longer accepts an insert from any client key.
    const inserted = await insertFeedback({
      user_id: uid,
      email,
      page,
      message,
      user_agent: userAgent,
      ip_hash: ipHash,
    });
    if (!inserted.ok) return { ok: false, error: GENERIC_ERROR };

    const resendKey = process.env.RESEND_API_KEY;
    const to = process.env.FEEDBACK_TO;
    if (!resendKey || !to) {
      // The row is saved either way -- mail delivery is best-effort.
      console.error("feedback: mail not configured");
      return { ok: true };
    }
    // Best-effort by design (the row above IS the record), but a failed send
    // is logged now instead of resolving silently - see sendFeedbackMail.
    await sendFeedbackMail(
      {
        from: "Scout <onboarding@resend.dev>",
        to,
        subject: `Scout feedback · ${page}`,
        text: `${message}\n\n- from: ${email ?? "no email"} · user: ${uid ?? "anonymous"} · page: ${page} · ua: ${userAgent}`,
      },
      (mail) => new Resend(resendKey).emails.send(mail),
    );

    return { ok: true };
  } catch (err) {
    console.error("feedback", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

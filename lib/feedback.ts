import { z } from "zod";

// Pure feedback-input validation (D10). Framework-free so it loads in the
// node:test runner without pulling in Next/Supabase -- node --experimental-strip-types
// cannot resolve an extensionless runtime *value* import between two lib/*.ts files.
const feedbackSchema = z.object({
  message: z.string().trim().min(1, "say something before sending").max(2000, "keep it under 2000 characters"),
  email: z.string().trim().max(320).optional(),
  // No length cap here: an oversized page value must fall back to "/"
  // below, never fail the whole parse -- see parseFeedback's doc comment.
  page: z.string().optional(),
});

const emailSchema = z.string().trim().email();

export type ParsedFeedback = { message: string; email: string | null; page: string };
export type ParseFeedbackResult = { ok: true; value: ParsedFeedback } | { ok: false; error: string };

// Never fails on a bad `page` -- it just falls back to "/" (D10: the page
// hint is best-effort context for the maker, not something worth blocking
// a submission over). `email` is the opposite: an empty value is fine
// (null), but a non-empty invalid one is rejected so a mistyped address
// doesn't silently swallow a reply.
export function parseFeedback(input: unknown): ParseFeedbackResult {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid feedback" };
  }
  const { message, email: rawEmail, page: rawPage } = parsed.data;

  let email: string | null = null;
  if (rawEmail && rawEmail.length > 0) {
    const emailResult = emailSchema.safeParse(rawEmail);
    if (!emailResult.success) return { ok: false, error: "enter a valid email, or leave it blank" };
    email = emailResult.data;
  }

  // A same-origin pathname only: no protocol-relative "//host", no control
  // characters (it is interpolated into the mail subject/body as text).
  const page =
    typeof rawPage === "string" &&
    rawPage.startsWith("/") &&
    !rawPage.startsWith("//") &&
    rawPage.length <= 200 &&
    !hasControlChars(rawPage)
      ? rawPage
      : "/";

  return { ok: true, value: { message, email, page } };
}

function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

export function dailyCapExceeded(count: number, cap = 10): boolean {
  return count >= cap;
}

// The Resend SDK does NOT throw when a send fails: it RESOLVES
// { data: null, error: {...} }. app/feedback-actions.ts awaited that promise
// without reading `error`, so a rejected send was completely silent (live
// evidence 2026-09-04: the feedback row landed at 00:18:20Z, no mail arrived,
// no Vercel error log). Mail stays best-effort - the ROW is the record, so the
// user still gets ok - but a failure is no longer invisible to us.
//
// The sender is injected so this stays framework-free and testable (the action
// itself cannot be imported by the node:test runner).
export type FeedbackMail = { from: string; to: string; subject: string; text: string };
type MailResult = { error?: { name?: string; message?: string } | null } | null | undefined;

export async function sendFeedbackMail(
  mail: FeedbackMail,
  send: (mail: FeedbackMail) => Promise<MailResult>,
): Promise<{ sent: boolean }> {
  try {
    const result = await send(mail);
    // Never log `mail`: it carries the recipient and the submitter's email.
    if (result?.error) {
      console.error("feedback mail", result.error.name ?? "error", result.error.message ?? "");
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error("feedback mail", err instanceof Error ? err.message : String(err));
    return { sent: false };
  }
}

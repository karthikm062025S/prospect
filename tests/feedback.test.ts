import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFeedback, dailyCapExceeded, sendFeedbackMail } from "../lib/feedback.ts";

test("parseFeedback accepts a minimal valid submission", () => {
  const result = parseFeedback({ message: "the scan seems slow today" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.message, "the scan seems slow today");
    assert.equal(result.value.email, null);
    assert.equal(result.value.page, "/");
  }
});

test("parseFeedback trims the message", () => {
  const result = parseFeedback({ message: "  hello there  " });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.message, "hello there");
});

test("parseFeedback rejects an empty message", () => {
  const result = parseFeedback({ message: "" });
  assert.equal(result.ok, false);
});

test("parseFeedback rejects a message that is only whitespace", () => {
  const result = parseFeedback({ message: "   " });
  assert.equal(result.ok, false);
});

test("parseFeedback rejects a message over 2000 characters", () => {
  const result = parseFeedback({ message: "a".repeat(2001) });
  assert.equal(result.ok, false);
});

test("parseFeedback accepts a message at exactly 2000 characters", () => {
  const result = parseFeedback({ message: "a".repeat(2000) });
  assert.equal(result.ok, true);
});

test("parseFeedback accepts a valid email", () => {
  const result = parseFeedback({ message: "hi", email: "karthik@example.com" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.email, "karthik@example.com");
});

test("parseFeedback treats an empty email as no email", () => {
  const result = parseFeedback({ message: "hi", email: "" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.email, null);
});

test("parseFeedback rejects a malformed non-empty email", () => {
  const result = parseFeedback({ message: "hi", email: "not-an-email" });
  assert.equal(result.ok, false);
});

test("parseFeedback keeps a valid pathname page", () => {
  const result = parseFeedback({ message: "hi", page: "/applications" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.page, "/applications");
});

test("parseFeedback falls back to / for a page not starting with /", () => {
  const result = parseFeedback({ message: "hi", page: "applications" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.page, "/");
});

test("parseFeedback falls back to / for a page over 200 characters", () => {
  const result = parseFeedback({ message: "hi", page: "/" + "a".repeat(200) });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.page, "/");
});

test("parseFeedback falls back to / when page is missing", () => {
  const result = parseFeedback({ message: "hi" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.page, "/");
});

test("parseFeedback rejects non-object input", () => {
  assert.equal(parseFeedback(null).ok, false);
  assert.equal(parseFeedback("hello").ok, false);
  assert.equal(parseFeedback(undefined).ok, false);
});

test("parseFeedback rejects a missing message field", () => {
  const result = parseFeedback({ email: "a@b.com" });
  assert.equal(result.ok, false);
});

test("dailyCapExceeded is false below the default cap", () => {
  assert.equal(dailyCapExceeded(9), false);
});

test("dailyCapExceeded is true at the default cap", () => {
  assert.equal(dailyCapExceeded(10), true);
});

test("dailyCapExceeded respects a custom cap", () => {
  assert.equal(dailyCapExceeded(3, 3), true);
  assert.equal(dailyCapExceeded(2, 3), false);
});

// Fold (2026-09-04): the Resend SDK resolves { data, error } instead of
// throwing, so `await resend.emails.send(...)` swallowed every delivery
// failure. Live evidence: a feedback row inserted at 2026-09-04T00:18:20Z, no
// email, no Vercel error log.
function captureErrors<T>(run: () => Promise<T>): Promise<{ result: T; logged: string[] }> {
  const original = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  return run().then(
    (result) => {
      console.error = original;
      return { result, logged };
    },
    (err) => {
      console.error = original;
      throw err;
    },
  );
}

const MAIL = { from: "Scout <onboarding@resend.dev>", to: "someone@example.com", subject: "s", text: "t" };

test("a resolved Resend error is logged, never swallowed", async () => {
  const { result, logged } = await captureErrors(() =>
    sendFeedbackMail(MAIL, async () => ({ data: null, error: { name: "validation_error", message: "domain is not verified" } })),
  );
  assert.deepEqual(result, { sent: false });
  assert.equal(logged.length, 1);
  assert.match(logged[0], /feedback mail validation_error domain is not verified/);
  assert.ok(!logged[0].includes("someone@example.com")); // never the recipient
});

test("a thrown send is logged the same way", async () => {
  const { result, logged } = await captureErrors(() =>
    sendFeedbackMail(MAIL, async () => {
      throw new Error("ECONNRESET");
    }),
  );
  assert.deepEqual(result, { sent: false });
  assert.match(logged[0], /feedback mail ECONNRESET/);
});

test("a successful send logs nothing", async () => {
  const { result, logged } = await captureErrors(() =>
    sendFeedbackMail(MAIL, async () => ({ data: { id: "re_1" }, error: null })),
  );
  assert.deepEqual(result, { sent: true });
  assert.equal(logged.length, 0);
});

test("the action still answers ok after a failed send", () => {
  // The action is a "use server" module (next/headers), so the boundary is
  // asserted against its source: mail is awaited, its result is not consulted
  // for the return value, and the user gets ok either way.
  const src = readFileSync(new URL("../app/feedback-actions.ts", import.meta.url), "utf8");
  assert.match(src, /await sendFeedbackMail\(/);
  assert.match(src, /\),\s*\r?\n\s*\);\s*\r?\n\s*\r?\n\s*return \{ ok: true \};/);
  assert.ok(!src.includes("await resend.emails.send"));
});

import assert from "node:assert/strict";
import test from "node:test";
import { resetSchema, signInSchema, signUpSchema, updatePasswordSchema } from "../app/auth/schema.ts";
import { LAST_ACCOUNT_KEY, parseLastAccount, serializeLastAccount, type LastAccount } from "../lib/last-account.ts";

// v8 onboarding: the pure halves of the sign-in dialog. The server actions
// (app/auth/actions.ts) only ever pass what these schemas accept to Supabase,
// and the "Continue as" card only ever renders what parseLastAccount returns.

test("signUpSchema: trims the name, caps it at 80, requires 8+ character passwords", () => {
  const ok = signUpSchema.safeParse({ full_name: "  Ada Lovelace ", email: " ada@example.com ", password: "12345678" });
  assert.ok(ok.success);
  assert.equal(ok.data.full_name, "Ada Lovelace");
  assert.equal(ok.data.email, "ada@example.com");

  assert.equal(signUpSchema.safeParse({ full_name: "   ", email: "ada@example.com", password: "12345678" }).success, false);
  assert.equal(signUpSchema.safeParse({ full_name: "a".repeat(81), email: "ada@example.com", password: "12345678" }).success, false);
  assert.equal(signUpSchema.safeParse({ full_name: "Ada", email: "not-an-email", password: "12345678" }).success, false);
  assert.equal(signUpSchema.safeParse({ full_name: "Ada", email: "ada@example.com", password: "1234567" }).success, false);
  assert.equal(signUpSchema.safeParse({ full_name: "Ada", email: "ada@example.com", password: "x".repeat(257) }).success, false);
});

test("signInSchema: any non-empty password is submitted (the length rule is for setting one)", () => {
  assert.ok(signInSchema.safeParse({ email: "ada@example.com", password: "short" }).success);
  assert.equal(signInSchema.safeParse({ email: "ada@example.com", password: "" }).success, false);
  assert.equal(signInSchema.safeParse({ email: "", password: "secret" }).success, false);
  assert.equal(signInSchema.safeParse({ email: "a".repeat(250) + "@x.io", password: "secret" }).success, false);
});

test("resetSchema and updatePasswordSchema", () => {
  assert.ok(resetSchema.safeParse({ email: "ada@example.com" }).success);
  assert.equal(resetSchema.safeParse({ email: "ada" }).success, false);
  assert.ok(updatePasswordSchema.safeParse({ password: "12345678" }).success);
  assert.equal(updatePasswordSchema.safeParse({ password: "1234567" }).success, false);
});

const ACCOUNT: LastAccount = {
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  avatarUrl: "https://lh3.googleusercontent.com/a/photo",
  provider: "google",
};

test("lastAccount round-trips and stores only the four display fields", () => {
  const raw = serializeLastAccount({ ...ACCOUNT, id: "uid", access_token: "x" } as LastAccount);
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ["avatarUrl", "email", "fullName", "provider"]);
  assert.deepEqual(parseLastAccount(raw), ACCOUNT);
  assert.equal(LAST_ACCOUNT_KEY, "scout_last_account");
});

test("parseLastAccount rejects malformed, oversized and foreign values", () => {
  assert.equal(parseLastAccount(null), null);
  assert.equal(parseLastAccount(""), null);
  assert.equal(parseLastAccount("{not json"), null);
  assert.equal(parseLastAccount("[]"), null);
  assert.equal(parseLastAccount('"ada@example.com"'), null);
  assert.equal(parseLastAccount(JSON.stringify({ fullName: "Ada" })), null, "email is required");
  assert.equal(parseLastAccount(JSON.stringify({ email: "ada", provider: "email" })), null, "email must look like one");
  assert.equal(parseLastAccount(JSON.stringify({ email: "ada@example.com", provider: "github" })), null);
  const oversized = JSON.stringify({ ...ACCOUNT, fullName: "a".repeat(2000) });
  assert.equal(parseLastAccount(oversized), null);
});

test("parseLastAccount strips unknown keys and unsafe avatar URLs", () => {
  const parsed = parseLastAccount(
    JSON.stringify({ ...ACCOUNT, avatarUrl: "javascript:alert(1)", token: "secret", fullName: "  " }),
  );
  assert.deepEqual(parsed, { fullName: null, email: "ada@example.com", avatarUrl: null, provider: "google" });
  assert.ok(parsed && !("token" in parsed));
});

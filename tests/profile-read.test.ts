import { test } from "node:test";
import assert from "node:assert/strict";
import type { User } from "@supabase/supabase-js";
import { firstName, initials, readProfile } from "../lib/profile.ts";

function user(meta: Record<string, unknown>, extra: Partial<User> = {}): User {
  return {
    id: "u1",
    email: "karthik@vt.edu",
    app_metadata: { provider: "email" },
    user_metadata: meta,
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    ...extra,
  } as User;
}

test("reads the Google metadata shape", () => {
  const profile = readProfile(
    user(
      { full_name: "Karthik Mandli", avatar_url: "https://x/p.png", monthly_target: 40, school: "VT", grad_term: "May 2028" },
      { app_metadata: { provider: "google" } },
    ),
  );
  assert.deepEqual(profile, {
    fullName: "Karthik Mandli",
    monthlyTarget: 40,
    school: "VT",
    gradTerm: "May 2028",
    email: "karthik@vt.edu",
    avatarUrl: "https://x/p.png",
    provider: "google",
  });
});

test("full_name falls back to name, avatar_url falls back to picture", () => {
  const profile = readProfile(user({ name: "Ada Lovelace", picture: "https://x/a.png" }));
  assert.equal(profile.fullName, "Ada Lovelace");
  assert.equal(profile.avatarUrl, "https://x/a.png");
});

test("blank strings are null, not empty strings", () => {
  const profile = readProfile(user({ full_name: "   ", avatar_url: "", school: "" }));
  assert.equal(profile.fullName, null);
  assert.equal(profile.avatarUrl, null);
  assert.equal(profile.school, null);
});

test("a missing metadata object still reads", () => {
  const profile = readProfile(user(undefined as unknown as Record<string, unknown>));
  assert.equal(profile.fullName, null);
  assert.equal(profile.monthlyTarget, null);
  assert.equal(profile.provider, "email");
});

test("any provider other than google reads as email", () => {
  assert.equal(readProfile(user({}, { app_metadata: { provider: "github" } })).provider, "email");
  assert.equal(readProfile(user({}, { app_metadata: {} as never })).provider, "email");
});

test("monthly_target coerces a numeric string to an integer", () => {
  assert.equal(readProfile(user({ monthly_target: "25" })).monthlyTarget, 25);
  assert.equal(readProfile(user({ monthly_target: 12.9 })).monthlyTarget, 12);
});

test("monthly_target outside 1-500 or unparseable is null", () => {
  for (const value of [0, -3, 501, 9999, "abc", "", null, {}]) {
    assert.equal(readProfile(user({ monthly_target: value })).monthlyTarget, null, `target ${String(value)}`);
  }
});

test("monthly_target keeps the inclusive bounds", () => {
  assert.equal(readProfile(user({ monthly_target: 1 })).monthlyTarget, 1);
  assert.equal(readProfile(user({ monthly_target: 500 })).monthlyTarget, 500);
});

test("firstName uses the first word, else the email local part", () => {
  assert.equal(firstName(readProfile(user({ full_name: "Karthik Mandli" }))), "Karthik");
  assert.equal(firstName(readProfile(user({}))), "karthik");
});

test("initials cover two names, one name and email-only", () => {
  assert.equal(initials(readProfile(user({ full_name: "Karthik Mandli" }))), "KM");
  assert.equal(initials(readProfile(user({ full_name: "Ada Beatrice Lovelace" }))), "AL");
  assert.equal(initials(readProfile(user({ full_name: "Prince" }))), "PR");
  assert.equal(initials(readProfile(user({}))), "KA");
});

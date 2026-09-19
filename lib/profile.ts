import type { User } from "@supabase/supabase-js";

// D9: per-user preferences live in Supabase `auth.users.user_metadata` — no new
// table, no migration, no RLS policy, because the data is the user's own and is
// already carried on the session the shell reads. This module is the ONE reader
// so every surface (nav avatar, settings form, Home stats) sees the same shape
// and the same coercion rules.
export type Profile = {
  fullName: string | null;
  monthlyTarget: number | null;
  school: string | null;
  gradTerm: string | null;
  email: string;
  avatarUrl: string | null;
  provider: "google" | "email";
};

// A metadata value only counts when it is a non-blank string: Google writes ""
// for fields the account has not filled, and an empty name must fall through to
// the next source rather than render as a blank avatar label.
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// The settings form posts a string, Google posts nothing, and a hand-edited
// metadata row could hold anything. 1–500 is the D9 range; everything outside
// it (0, 9999, "abc", 12.5 → 12) is either clamped away or dropped to null so
// no caller has to defend itself.
function target(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return null;
  const whole = Math.trunc(parsed);
  return whole >= 1 && whole <= 500 ? whole : null;
}

export function readProfile(user: User): Profile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    // Google fills `full_name`; some providers only send `name`; email sign-up
    // sets `full_name` itself.
    fullName: text(meta.full_name) ?? text(meta.name),
    monthlyTarget: target(meta.monthly_target),
    school: text(meta.school),
    gradTerm: text(meta.grad_term),
    email: user.email ?? "",
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
    provider: user.app_metadata?.provider === "google" ? "google" : "email",
  };
}

// The nav shows a first name, never the whole legal name — the email local part
// is the fallback so the button is never empty.
export function firstName(profile: Profile): string {
  const fromName = profile.fullName?.split(/\s+/)[0];
  if (fromName) return fromName;
  return profile.email.split("@")[0] ?? "";
}

// The avatar disc when there is no picture: two initials from the name, else one
// from the email local part.
export function initials(profile: Profile): string {
  const words = profile.fullName?.split(/\s+/).filter(Boolean) ?? [];
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const local = profile.email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase();
}

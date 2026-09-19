"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/require-user";
import { field, resetSchema, signInSchema, signUpSchema, updatePasswordSchema } from "./schema";

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

// The public origin this request arrived on (proxy-aware), so password-reset
// links come back to the same host the visitor is using.
async function resolveOrigin(): Promise<string | null> {
  const headerStore = await headers();
  const forwardedHost = firstHeaderValue(headerStore.get("x-forwarded-host"));
  const forwardedProto = firstHeaderValue(headerStore.get("x-forwarded-proto"));
  const host = forwardedHost ?? firstHeaderValue(headerStore.get("host"));
  if (!host) return null;
  const protocol =
    forwardedProto ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

// Error and notice codes are the ONLY thing that reaches the URL; the sign-in
// dialog maps each to one sentence. Raw Supabase error text never reaches the UI.
export async function signInWithPasswordAction(formData: FormData) {
  const parsed = signInSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
  });
  if (!parsed.success) redirect("/welcome?error=password");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect("/welcome?error=password");
  redirect("/");
}

export async function signUpAction(formData: FormData) {
  const parsed = signUpSchema.safeParse({
    full_name: field(formData, "full_name"),
    email: field(formData, "email"),
    password: field(formData, "password"),
  });
  if (!parsed.success) redirect("/welcome?error=signup");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.full_name } },
  });
  if (error) redirect("/welcome?error=signup");
  // No session = "Confirm email" is still ON in the Supabase dashboard
  // (decision 1 turns it off; see planning/v8-onboarding-karthik-steps.md).
  if (!data.session) redirect("/welcome?notice=confirm");
  redirect("/");
}

export async function requestPasswordResetAction(formData: FormData) {
  const parsed = resetSchema.safeParse({ email: field(formData, "email") });
  const origin = await resolveOrigin();
  if (parsed.success && origin) {
    const supabase = await createClient();
    // Result deliberately ignored: the notice must not reveal whether the
    // address has an account.
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${origin}/auth/callback?next=/auth/update-password`,
    });
  }
  redirect("/welcome?notice=reset");
}

export async function updatePasswordAction(formData: FormData) {
  await requireUser();
  const parsed = updatePasswordSchema.safeParse({ password: field(formData, "password") });
  if (!parsed.success) redirect("/auth/update-password?error=password");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect("/auth/update-password?error=update");
  redirect("/settings?notice=password#account");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Stays hashless on purpose. Next carries the previous
  // focusAndScrollRef.hashFragment forward on a hashless navigation
  // (node_modules/next/dist/client/components/segment-cache/navigation.js), which
  // is what used to drop sign-out part-way down the landing. Putting a fragment
  // HERE looked like the fix and is not: a hash in the entry URL poisons the
  // stored canonical (navigation.js appends each new hash to it), so every later
  // in-page anchor builds a malformed "#hero#feed" that resolves to nothing.
  // components/landing/open-on-hero.tsx corrects the scroll at the destination.
  redirect("/welcome");
}

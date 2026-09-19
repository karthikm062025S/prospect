import { z } from "zod";

// Pure validation for the sign-in dialog and the password pages. Framework-free
// so tests/auth-forms.test.ts loads it in node:test directly (same pattern as
// app/(app)/settings/schema.ts).
const email = z.string().trim().max(254, "Email is too long.").pipe(z.email("Enter a valid email."));
const password = z.string().min(8, "Use at least 8 characters.").max(256, "Password is too long.");

export const signInSchema = z.object({
  email,
  // Sign-in only checks presence; the length rule applies when a password is SET.
  password: z.string().min(1, "Enter your password.").max(256, "Password is too long."),
});

export const signUpSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your name.").max(80, "Keep your name under 80 characters."),
  email,
  password,
});

export const resetSchema = z.object({ email });

export const updatePasswordSchema = z.object({ password });

export function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  // Single-line display/credential text: strip C0 control characters and DEL.
  return typeof value === "string" ? value.replace(/[\x00-\x1F\x7F]/g, "") : "";
}

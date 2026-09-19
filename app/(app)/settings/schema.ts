import { z } from "zod";

// Pure validation for /settings (D9). Framework-free so it loads in the
// node:test runner directly — see lib/feedback.ts for the same pattern.

// Strips C0 control characters and DEL before trimming; user_metadata fields
// are single-line display text, never HTML/markup.
export function stripControlChars(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]/g, "");
}

export const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, "Full name is required.")
    .max(80, "Keep your name under 80 characters."),
  school: z.string().trim().max(80, "Keep school under 80 characters.").optional(),
  grad_term: z.string().trim().max(40, "Keep graduation term under 40 characters.").optional(),
});

export const targetSchema = z.object({
  monthly_target: z
    .string()
    .transform((v) => v.trim())
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 500), {
      message: "Enter a whole number between 1 and 500, or leave it empty.",
    }),
});

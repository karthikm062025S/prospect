"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/require-user";
import { profileSchema, targetSchema, stripControlChars } from "./schema";

export type ActionResult = { ok: true } | { ok: false; error: string };

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return stripControlChars(typeof value === "string" ? value : "");
}

export async function updateProfileAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();

  const parsed = profileSchema.safeParse({
    full_name: field(formData, "full_name"),
    school: field(formData, "school"),
    grad_term: field(formData, "grad_term"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid profile." };
  }
  const { full_name, school, grad_term } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: {
      full_name,
      school: school || null,
      grad_term: grad_term || null,
    },
  });
  if (error) return { ok: false, error: "Could not save your profile. Try again." };

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateTargetAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();

  const parsed = targetSchema.safeParse({ monthly_target: field(formData, "monthly_target") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid target." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: { monthly_target: parsed.data.monthly_target },
  });
  if (error) return { ok: false, error: "Could not save your target. Try again." };

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true };
}

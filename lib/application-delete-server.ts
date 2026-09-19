import { createServiceClient } from "@/lib/supabase/service";

// Server-only: never import from a Client Component (mirrors the guard in
// tests/no-service-in-app.test.ts). Legacy single-user column: roles.application_id
// still carries a plain FK to applications with no ON DELETE rule, so deleting an
// application fails with 23503 while a role points at it. Nothing writes that
// column any more; this clears it for the ONE application whose ownership the
// caller has already verified. Service role because roles is not user-writable.
// ponytail: the durable fix is db/FIX-2026-09-05-roles-application-fk.sql
// (ON DELETE SET NULL); remove this once Karthik has run it.
export async function unlinkLegacyRolePointer(applicationId: string): Promise<string | null> {
  const { error } = await createServiceClient()
    .from("roles")
    .update({ application_id: null })
    .eq("application_id", applicationId);
  return error ? error.message : null;
}

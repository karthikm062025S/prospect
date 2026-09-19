import type { QueryFn } from "./db";

// Server-only: never import from a Client Component. Legacy single-user column:
// roles.application_id still points at applications (ON DELETE SET NULL in
// db/lakebase/001-schema.sql, so the delete itself can no longer fail on it).
// Nothing writes that column any more; this clears it for the ONE application
// whose ownership the caller has already verified, inside the caller's delete
// transaction. Service tier: `roles` has no user column (tests/user-scoping.test.ts
// allowlist).
// ponytail: remove once the legacy column is dropped.
export async function unlinkLegacyRolePointer(q: QueryFn, applicationId: string): Promise<void> {
  await q("update roles set application_id = null where application_id = $1", [applicationId], "roles");
}

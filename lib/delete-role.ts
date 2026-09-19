import type { QueryFn } from "./db";

// Single source of truth for "hard delete + tombstone a role" (SPEC FR-051/052):
// used by the delete_role MCP tool so a role removed by an owner tool leaves the
// view for good AND is remembered — the next watcher run can't re-insert it.
// Tombstone is keyed on the (company_id, title, posted_at) triple upsertRole
// checks. Returns how many rows were tombstoned+deleted (0 if none of the ids
// existed). Service tier: `roles` and `tombstones` are shared tables with no
// user column (tests/user-scoping.test.ts allowlist).
export async function tombstoneAndDeleteRoles(q: QueryFn, roleIds: string[]): Promise<{ deleted: number }> {
  if (roleIds.length === 0) return { deleted: 0 };
  const roles = await q<{ id: string; company_id: string; title: string; posted_at: string | null; link: string | null }>(
    "select id, company_id, title, posted_at, link from roles where id = any($1::uuid[])",
    [roleIds],
    "roles",
  );
  if (roles.length === 0) return { deleted: 0 };

  // A repeat tombstone for the same identity is harmless (upsertRole only checks
  // existence), so no dedup needed here.
  await q(
    `insert into tombstones (company_id, title, posted_at, link)
     select * from unnest($1::uuid[], $2::text[], $3::date[], $4::text[])`,
    [roles.map((r) => r.company_id), roles.map((r) => r.title), roles.map((r) => r.posted_at), roles.map((r) => r.link)],
    "tombstones",
  );
  await q("delete from roles where id = any($1::uuid[])", [roles.map((r) => r.id)], "roles");
  return { deleted: roles.length };
}

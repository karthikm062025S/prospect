import type { SupabaseClient } from "@supabase/supabase-js";

// Single source of truth for "hard delete + tombstone a role" (SPEC FR-051/052):
// used by the delete server actions (app/actions.ts) AND the delete_role MCP tool
// so a role removed by the owner OR by an owner tool leaves the view for good AND
// is remembered — the next watcher run can't re-insert it. Tombstone is keyed on
// the (company_id, title, posted_at) triple upsertRole checks. Returns how many
// rows were tombstoned+deleted (0 if none of the ids existed).
export async function tombstoneAndDeleteRoles(
  supabase: SupabaseClient,
  roleIds: string[],
): Promise<{ deleted: number }> {
  if (roleIds.length === 0) return { deleted: 0 };
  const { data: roles, error: findError } = await supabase
    .from("roles")
    .select("id, company_id, title, posted_at, link")
    .in("id", roleIds);
  if (findError) throw new Error(`role lookup failed: ${findError.message}`);
  if (!roles || roles.length === 0) return { deleted: 0 };

  const tombstones = roles.map((r) => ({
    company_id: r.company_id,
    title: r.title,
    posted_at: r.posted_at,
    link: r.link,
  }));
  // A repeat tombstone for the same identity is harmless (upsertRole only checks
  // existence), so no dedup needed here.
  const { error: tombError } = await supabase.from("tombstones").insert(tombstones);
  if (tombError) throw new Error(`tombstone insert failed: ${tombError.message}`);

  const { error: delError } = await supabase
    .from("roles")
    .delete()
    .in(
      "id",
      roles.map((r) => r.id),
    );
  if (delError) throw new Error(`role delete failed: ${delError.message}`);
  return { deleted: roles.length };
}

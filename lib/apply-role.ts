import type { QueryFn } from "./db";
import type { Application } from "./types";

export type ApplyToRoleResult =
  | { ok: true; application: Application }
  | { ok: false; reason: "not_found" | "already_applied" };

// Pure: the one place that turns a failed ApplyToRoleResult into the
// user-facing message, shared by app/actions.ts (confirmAppliedAction) and
// app/role-actions.ts (markAlreadyAppliedAction) so the two callers can't
// drift (L8 audit: both previously fell through an already_applied result
// as a silent `{ ok: true }` — nothing was recorded, nothing was said).
export function applyResultError(reason: "not_found" | "already_applied"): string {
  return reason === "not_found" ? "role not found" : "Already applied.";
}

// A shared role stays untouched. Applying creates a row owned by uid and links
// it through the uid+role_id user_roles row; other users keep seeing the role.
// Callers run this inside lib/db.ts withTransaction (app/actions.ts,
// app/role-actions.ts): the existing-link check, the insert and the link are
// then one atomic unit, so two confirms on the same role can no longer both
// pass the check (the L8 race). The link row is locked `for update` so the
// second transaction waits, re-reads, and sees the first one's application_id.
export async function applyToRole(q: QueryFn, uid: string, roleId: string, resumeFile?: string): Promise<ApplyToRoleResult> {
  const [role] = await q<{
    id: string;
    company_id: string;
    title: string;
    link: string | null;
    lifecycle: string;
    jd_snapshot: string | null;
    jd_snapshot_at: string | null;
  }>(
    "select id, company_id, title, link, lifecycle, jd_snapshot, jd_snapshot_at from roles_public where id = $1",
    [roleId],
    "roles_public",
  );
  if (!role || role.lifecycle !== "open") return { ok: false, reason: "not_found" };

  const [existing] = await q<{ application_id: string | null }>(
    "select application_id from user_roles where user_id = $1 and role_id = $2 for update",
    [uid, roleId],
    "user_roles",
  );
  if (existing?.application_id) return { ok: false, reason: "already_applied" };

  const now = new Date().toISOString();
  const [application] = await q<Application>(
    `insert into applications (user_id, role_id, company_id, role, resume_file, jd_link, jd_snapshot, jd_snapshot_at, status_changed_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [uid, roleId, role.company_id, role.title, resumeFile || null, role.link, role.jd_snapshot, role.jd_snapshot_at, now],
    "applications",
  );

  // The `where` on the conflict branch is the atomic half of the race fix: a link
  // row that already carries an application_id is never overwritten, so a
  // concurrent second confirm links nothing, throws, and (inside withTransaction)
  // rolls back the application it just inserted instead of orphaning ours.
  const linked = await q<{ application_id: string }>(
    `insert into user_roles (user_id, role_id, application_id, apply_clicked_at, updated_at)
     values ($1, $2, $3, null, $4)
     on conflict (user_id, role_id) do update
       set application_id = excluded.application_id, apply_clicked_at = null, updated_at = excluded.updated_at
       where user_roles.application_id is null
     returning application_id`,
    [uid, roleId, application.id, now],
    "user_roles",
  );
  if (linked.length !== 1) throw new Error("user role link failed: already linked to another application");

  return { ok: true, application };
}

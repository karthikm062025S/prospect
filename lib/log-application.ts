import type { QueryFn } from "./db";
import type { Application } from "./types";

export type LogApplicationInput = {
  company: string;
  role: string;
  date_applied?: string;
  resume_file?: string;
  visa_flag?: string;
  jd_link?: string;
  notes?: string;
};

// Single source of truth for "log an application": used by the dashboard's
// server action, the Applied-from-drop action, and the log_application MCP
// tool. Looks the company up by name (created as a one-off, unwatched, if it
// doesn't exist yet); if the company is being watched, flips it to
// applied_lock so the watcher never re-surfaces it (the no-double-work rule).
// Creation IS the first status set, so the insert stamps status_changed_at
// (RB-026 — the migration only backfilled pre-existing rows; a null here
// would make the stale badge impossible for every new application). The
// one-writer rule (TRD §3) stays honest: this is the only insert path, and
// every later change still goes through setApplicationStatus.
export async function logApplication(
  q: QueryFn,
  uid: string,
  input: LogApplicationInput,
  nowIso: string = new Date().toISOString(),
): Promise<Application> {
  const name = input.company.trim();
  const role = input.role.trim();
  if (!name) throw new Error("company is required");
  if (!role) throw new Error("role is required");

  // Escape LIKE metacharacters so "S&P_Global" style names match literally
  // (exact, case-insensitive match — never a substring search).
  const likeSafeName = name.replace(/[\\%_]/g, "\\$&");
  const [existing] = await q<{ id: string; watch_status: string; is_watched: boolean }>(
    "select id, watch_status, is_watched from companies where name ilike $1 limit 1",
    [likeSafeName],
    "companies",
  );

  let companyId: string;
  if (existing) {
    companyId = existing.id;
    if (existing.is_watched && existing.watch_status !== "applied_lock") {
      await q("update companies set watch_status = 'applied_lock' where id = $1", [companyId], "companies");
    }
  } else {
    const [created] = await q<{ id: string }>(
      "insert into companies (name, is_watched) values ($1, false) returning id",
      [name],
      "companies",
    );
    companyId = created.id;
  }

  // An omitted date_applied takes the column default (today).
  const [application] = await q<Application>(
    `insert into applications (user_id, company_id, role, date_applied, resume_file, visa_flag, jd_link, notes, status_changed_at)
     values ($1, $2, $3, coalesce($4::date, current_date), $5, $6, $7, $8, $9)
     returning *`,
    [
      uid,
      companyId,
      role,
      input.date_applied || null,
      input.resume_file || null,
      input.visa_flag || null,
      input.jd_link || null,
      input.notes || null,
      nowIso,
    ],
    "applications",
  );
  return application;
}

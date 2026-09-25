import type { Season } from "./season";
import type { Family } from "./family";

// The ONE user-facing message for an error the user cannot act on. It lives
// here rather than in app/actions.ts because a "use server" module may only
// export async functions.
export const GENERIC_ERROR = "Something went wrong. Try again.";

// The action boundary for any error string that came from a layer below it: a
// PostgREST message ("column roles.x does not exist"), a fetch failure or an
// exception text is noise to the user and detail to an attacker, and the panes
// render whatever `error` they are handed. The real one goes to the server
// log; the user gets the one line above. null stays null (no error).
export function publicError(error: string | null | undefined): string | null {
  if (!error) return null;
  console.error("action", error);
  return GENERIC_ERROR;
}

export type WatchStatus = "not_open" | "open" | "closed" | "applied_lock";
export type AppStatus = "applied" | "oa" | "interviewing" | "offer" | "rejected" | "withdrawn";

// Column-limited companies_public shape used by the signed-in app.
export type Company = {
  id: string;
  name: string;
  tier: string | null;
  careers_url: string | null;
  link: string | null;
  visa_note: string | null;
};

// Full base-table row for trusted ingest and owner-only MCP code.
export type CompanyRow = Company & {
  ats: string | null;
  endpoint: string | null;
  watch_status: WatchStatus;
  notes: string | null;
  is_watched: boolean;
  updated_at: string;
};

export type Application = {
  id: string;
  user_id: string;
  company_id: string;
  role_id: string | null;
  role: string;
  status: AppStatus;
  date_applied: string;
  resume_file: string | null;
  visa_flag: string | null;
  jd_link: string | null;
  notes: string | null;
  updated_at: string;
  follow_up_at: string | null;
  next_action: string | null;
  jd_snapshot: string | null;
  jd_snapshot_at: string | null;
  status_changed_at: string | null;
};

export type ApplicationWithCompany = Application & {
  company_name: string;
  posted_at?: string | null;
  deadline?: string | null;
};

export type RoleLifecycle = "open" | "applied";
export type VisaClass = "clean" | "question" | "no_sponsors" | "citizen_required";

// Column-limited roles_public shape used by the signed-in app.
export type Role = {
  id: string;
  company_id: string;
  title: string;
  role_type: string | null;
  lifecycle: RoleLifecycle;
  posted_at: string | null;
  deadline: string | null;
  link: string | null;
  source: string | null;
  visa_class: string | null;
  eligible: boolean | null;
  eligibility_note: string | null;
  location: string | null;
  season: Season;
  family: Family;
  // Task 2 / D2/D4 (fold 2026-09-15): optional so existing Role
  // fixtures/literals elsewhere stay valid; the DB column is nullable too.
  families?: Family[] | null;
  // Task 3 T2/T3 (2026-09-16): optional for the same reason as
  // `families` above — last_seen_at/canonical_key/gate_checked_at are
  // nullable columns, repost_count defaults to 0; existing Role literals
  // elsewhere in the app stay valid without listing all four.
  last_seen_at?: string | null;
  repost_count?: number;
  canonical_key?: string | null;
  gate_checked_at?: string | null;
  jd_snapshot: string | null;
  jd_snapshot_at: string | null;
  created_at: string;
  updated_at: string;
};

// Full base-table row for trusted ingest and owner-only MCP code.
export type RoleRow = Role & {
  fit_note: string | null;
  priority: string | null;
  application_id: string | null;
  notes: string | null;
  apply_clicked_at: string | null;
  saved_at: string | null;
  hidden_at: string | null;
  jd_error: string | null;
};

export type UserRole = {
  user_id: string;
  role_id: string;
  saved_at: string | null;
  hidden_at: string | null;
  apply_clicked_at: string | null;
  deleted_at: string | null;
  application_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RoleWithCompany = RoleRow & { company_name: string };

export type EventKind = "confirmation" | "oa" | "interview" | "rejection" | "other";

export type ApplicationEvent = {
  id: string;
  user_id: string;
  application_id: string | null;
  company_id: string | null;
  kind: EventKind;
  subject: string;
  sender: string;
  received_at: string;
  snippet: string | null;
  classified_by: "rule" | "model" | "user";
  created_at: string;
};

// List payloads deliberately omit the current user's id and large JD HTML.
export type ApplicationDetailRow = Omit<Application, "jd_snapshot" | "user_id"> & {
  company_name: string;
  posted_at: string | null;
  deadline: string | null;
};
export type EventRow = Omit<ApplicationEvent, "user_id"> & { company_name: string | null };

export function isNoSponsorship(visaFlag: string | null): boolean {
  return !!visaFlag && /no\s*spons/i.test(visaFlag);
}

// Only HTTP(S) values from shared-feed ingestion may reach an href.
export function safeHttpUrl(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

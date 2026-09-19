-- Scout rebuild migration (2026-09) — TRD §3 schema delta, verbatim.
-- Additive only, zero data loss; idempotent (if not exists guards).

-- applications: the detail-pane fields the PRD adds
alter table applications
  add column if not exists follow_up_at date,
  add column if not exists next_action text,
  add column if not exists jd_snapshot text,
  add column if not exists jd_snapshot_at timestamptz,
  add column if not exists status_changed_at timestamptz;
-- backfill so the stale derivation has a floor for existing rows
update applications set status_changed_at = updated_at where status_changed_at is null;

-- application events: the Gmail lane (RB-080/081)
create table if not exists application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id) on delete cascade,   -- an application deleted by the user takes its matched events with it; they are not republished as unmatched
  company_id uuid references companies(id),
  kind text not null check (kind in ('confirmation','oa','interview','rejection','other')),
  subject text not null,
  sender text not null,
  received_at timestamptz not null,
  snippet text,
  gmail_msgid text unique,   -- Gmail X-GM-MSGID (ImapFlow `emailId`), stable across mailboxes; IMAP UIDs are NOT (per-mailbox + UIDVALIDITY)
  suggested_status text,
  classified_by text not null default 'rule' check (classified_by in ('rule','model','user')),
  confidence real,            -- null for rule/user; model score otherwise
  auto_applied boolean not null default false,   -- RB-081: the stage was set from this event (badge + undo)
  prev_status text,           -- RB-081: the application status before the auto-flip, so undo can restore it
  created_at timestamptz default now()
);
create index if not exists application_events_app_idx on application_events (application_id, received_at desc);
-- house convention (verified live 2026-08-24): every table has RLS enabled, no policies —
-- server code uses the service role; the anon key sees nothing.
alter table application_events enable row level security;

-- learned classifier rules (RB-080 tier 3): written by the UI on confirm/correct, read by the watcher lane
create table if not exists email_rules (
  id uuid primary key default gen_random_uuid(),
  sender_domain text not null,
  subject_pattern text not null,   -- generalized template, e.g. "Reminder from {Company}!"
  kind text not null check (kind in ('confirmation','oa','interview','rejection','other')),
  created_at timestamptz default now(),
  unique (sender_domain, subject_pattern)
);
alter table email_rules enable row level security;

-- roles: the pending apply-confirmation (RB-013: survives close/reopen)
alter table roles
  add column if not exists apply_clicked_at timestamptz;

-- home default sort key already exists: roles.created_at (RB-002)
create index if not exists roles_open_created_idx
  on roles (created_at desc) where lifecycle = 'open';
create index if not exists applications_date_idx
  on applications (date_applied desc);

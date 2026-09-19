-- v5 (2026-08-24): Home role detail + save/hide + ingest-time JD capture + location.
-- Additive only, idempotent. Apply in the Supabase SQL editor; log in migration-2026-09-v5.log.md.
alter table roles
  add column if not exists location text,                 -- from the ATS JSON (greenhouse location.name / lever categories.location / ashby location / workday jobPostingInfo.location)
  add column if not exists saved_at timestamptz,          -- "Save for later" (null = not saved)
  add column if not exists hidden_at timestamptz,         -- "Hide" (soft; distinct from delete+tombstone; un-hide clears it)
  add column if not exists jd_snapshot text,              -- sanitized posting HTML captured at ingest / lazily on first open
  add column if not exists jd_snapshot_at timestamptz,
  add column if not exists jd_error text;                 -- last capture error (null on success)
create index if not exists roles_saved_idx on roles (saved_at desc) where saved_at is not null;
-- Manual timeline entries need NO schema change: they are application_events
-- rows under the existing 'other' kind, marked by classified_by='user' with a
-- null gmail_msgid. (An earlier draft widened application_events_kind_check for
-- a 'note' kind; dropped, so the timeline works before this file is applied.)

-- Scout on Databricks Lakebase (Postgres 17): the whole app schema, one file, idempotent.
-- Owner lane: L0 (2026-09-19). Apply:  psql "$LAKEBASE_URL" -f db/lakebase/001-schema.sql
-- Re-running is a no-op (create ... if not exists / drop-then-add on constraints).
--
-- UNVERIFIED base columns: roles, companies, applications, outreach were created in
-- Supabase before any tracked migration. Their base column TYPES and DEFAULTS below are
-- reconstructed from the 2026-09-04 export (db/baseline-2026-09/*.json) + lib/types.ts,
-- not read from the old catalog. Every later column comes from the tracked db/*.sql files
-- in date order (collapse -> rebuild -> fast-lane -> v5 -> v7 -> task2 -> task3).
--
-- Deliberate differences from Supabase:
--   * no FKs to auth.users: user ids are Supabase Auth UUIDs validated by lib/require-user.ts;
--   * no RLS: Lakebase has one role; every per-user query carries `user_id = $n` in code
--     (tests/user-scoping.test.ts is the static guard);
--   * roles_public / companies_public are plain views (the column allowlist the app reads);
--   * no pg_cron: the hot scan tier is scheduled from .github/workflows/heartbeat.yml.
-- Addendum 2026-09-19 15:05: roles.source_posted_at (the board's own publish timestamp) for
-- the drop-latency measurement (created_at - source_posted_at).
-- Addendum 2026-09-19 16:45: roles.level (internship|coop|new_grad|full_time|research, nullable)
-- for the widened "every major, every level" scan; the insert gate keeps every function/level.

create table if not exists companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  tier         text,
  careers_url  text,
  endpoint     text,
  ats          text,
  link         text,
  notes        text,
  visa_note    text,
  is_watched   boolean not null default false,
  watch_status text not null default 'not_open',
  updated_at   timestamptz not null default now()
  -- no created_at: the source table never had one (L0-inventory §1)
);

create table if not exists roles (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies (id),
  title             text not null,
  role_type         text,
  lifecycle         text not null default 'open',
  posted_at         date,
  deadline          date,
  link              text,
  source            text,
  visa_class        text,
  eligible          boolean,
  eligibility_note  text,
  notes             text,
  fit_note          text,
  priority          text,
  application_id    uuid,                 -- legacy single-user pointer; FK added below (circular with applications)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  apply_clicked_at  timestamptz,          -- rebuild
  location          text,                 -- v5
  saved_at          timestamptz,
  hidden_at         timestamptz,
  jd_snapshot       text,
  jd_snapshot_at    timestamptz,
  jd_error          text,
  season            text not null default 'unspecified',   -- v7
  family            text,
  families          text[],               -- task2
  classified_by     text,
  classified_model  text,
  classified_at     timestamptz,
  last_seen_at      timestamptz,          -- task3
  repost_count      integer not null default 0,
  canonical_key     text,
  gate_checked_at   timestamptz,
  source_posted_at  timestamptz,          -- addendum: the board's own publish time
  level             text                  -- addendum 2: posting level, null when the source did not say
);
alter table roles add column if not exists source_posted_at timestamptz;
alter table roles add column if not exists level text;
alter table roles drop constraint if exists roles_level_check;
alter table roles add constraint roles_level_check
  check (level is null or level in ('internship', 'coop', 'new_grad', 'full_time', 'research'));
alter table roles drop constraint if exists roles_lifecycle_check;
alter table roles add constraint roles_lifecycle_check check (lifecycle in ('open', 'applied'));
alter table roles drop constraint if exists roles_classified_by_check;
alter table roles add constraint roles_classified_by_check check (classified_by is null or classified_by in ('rules', 'llm'));
alter table roles drop constraint if exists roles_repost_count_check;
alter table roles add constraint roles_repost_count_check check (repost_count >= 0);

create table if not exists applications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,       -- Supabase Auth user id (no FK, D11)
  company_id         uuid not null references companies (id),
  role_id            uuid references roles (id) on delete set null,
  role               text not null,
  status             text not null default 'applied',
  date_applied       date not null default current_date,
  resume_file        text,
  visa_flag          text,
  jd_link            text,
  notes              text,
  updated_at         timestamptz not null default now(),
  follow_up_at       date,                -- rebuild
  next_action        text,
  jd_snapshot        text,
  jd_snapshot_at     timestamptz,
  status_changed_at  timestamptz
);
-- FIX-2026-09-05: the legacy roles.application_id pointer must never block an application delete.
alter table roles drop constraint if exists roles_application_id_fkey;
-- Deferrable so scripts/import-baseline.mjs can load the circular roles<->applications pair in one transaction.
alter table roles add constraint roles_application_id_fkey
  foreign key (application_id) references applications (id) on delete set null deferrable initially deferred;

create table if not exists user_roles (
  user_id           uuid not null,
  role_id           uuid not null references roles (id) on delete cascade,
  saved_at          timestamptz,
  hidden_at         timestamptz,
  apply_clicked_at  timestamptz,
  deleted_at        timestamptz,
  application_id    uuid references applications (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table if not exists application_events (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid references applications (id) on delete cascade,
  company_id      uuid references companies (id),
  kind            text not null check (kind in ('confirmation', 'oa', 'interview', 'rejection', 'other')),
  subject         text not null,
  sender          text not null,
  received_at     timestamptz not null,
  snippet         text,
  classified_by   text not null default 'rule' check (classified_by in ('rule', 'model', 'user')),
  created_at      timestamptz default now(),
  user_id         uuid
);

create table if not exists outreach (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  company_id      uuid,
  role_id         uuid,
  company_name    text not null,
  role_label      text,
  contact_name    text not null,
  contact_title   text,
  channel         text not null default 'linkedin',
  contact_handle  text,
  message         text,
  status          text not null default 'drafted',
  sent_at         date,
  follow_up_at    date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  email       text,
  page        text,
  message     text not null check (char_length(message) between 1 and 2000),
  user_agent  text,
  created_at  timestamptz not null default now(),
  ip_hash     text
);
alter table feedback drop constraint if exists feedback_field_lengths;
alter table feedback add constraint feedback_field_lengths check (
  char_length(coalesce(page, '')) <= 300
  and char_length(coalesce(email, '')) <= 320
  and char_length(coalesce(user_agent, '')) <= 512
  and char_length(coalesce(ip_hash, '')) <= 128
);

create table if not exists watch_state (
  endpoint_key   text primary key,
  etag           text,
  last_modified  text,
  checked_at     timestamptz
);

create table if not exists tombstones (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies (id) on delete cascade,
  title       text not null,
  posted_at   date,
  link        text,
  created_at  timestamptz not null default now()
);

create table if not exists role_corrections (
  user_id     uuid not null,
  role_id     uuid not null references roles (id) on delete cascade,
  field       text not null check (field in ('season', 'family', 'visa_class')),
  value       text not null check (length(value) between 1 and 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, role_id, field),
  constraint role_corrections_allowed_value_check check (
    (field = 'season' and value in ('summer_2027', 'fall_2027', 'spring_2028', 'summer_2028', 'coop', 'unspecified'))
    or (field = 'family' and value in ('swe', 'ai_ml', 'data', 'quant', 'product', 'security', 'hardware', 'design', 'other'))
    or (field = 'visa_class' and value in ('clean', 'question', 'no_sponsors', 'citizen_required'))
  )
);

-- Indexes (every one the tracked migrations created, plus the addendum's).
create index if not exists roles_open_created_idx on roles (created_at desc) where lifecycle = 'open';
create index if not exists roles_saved_idx on roles (saved_at desc) where saved_at is not null;
create unique index if not exists roles_dedup_uidx on roles (company_id, title, posted_at) nulls not distinct;
create index if not exists roles_season_idx on roles (season) where lifecycle = 'open';
create index if not exists roles_classify_residue_idx on roles (created_at) where lifecycle = 'open' and classified_at is null;
create index if not exists roles_canonical_key_idx on roles (canonical_key) where canonical_key is not null;
create index if not exists roles_gate_residue_idx on roles (created_at) where jd_snapshot is not null and gate_checked_at is null;
create index if not exists roles_source_posted_idx on roles (source_posted_at desc) where source_posted_at is not null;
create index if not exists roles_level_idx on roles (level) where lifecycle = 'open';
create index if not exists applications_date_idx on applications (date_applied desc);
create index if not exists applications_user_status_idx on applications (user_id, status, updated_at desc);
create index if not exists user_roles_application_idx on user_roles (application_id) where application_id is not null;
create index if not exists user_roles_user_saved_idx on user_roles (user_id, saved_at desc) where saved_at is not null;
create index if not exists user_roles_user_hidden_idx on user_roles (user_id) where hidden_at is not null or deleted_at is not null or application_id is not null;
create index if not exists application_events_app_idx on application_events (application_id, received_at desc);
create index if not exists application_events_user_idx on application_events (user_id, application_id);
create index if not exists outreach_user_idx on outreach (user_id, updated_at desc);
create index if not exists feedback_user_day_idx on feedback (user_id, created_at desc);
create index if not exists feedback_created_idx on feedback (created_at desc);
create index if not exists feedback_ip_day_idx on feedback (ip_hash, created_at desc);
create index if not exists tombstones_lookup_idx on tombstones (company_id, title);
-- Company names are looked up case-insensitively (ilike, exact); two rows differing only by case would make that ambiguous.
create unique index if not exists companies_name_ci_uidx on companies (lower(name));
create index if not exists role_corrections_user_idx on role_corrections (user_id);

-- Views: the public column allowlists the signed-in app reads (never notes, fit_note, priority,
-- application_id, apply_clicked_at, saved_at, hidden_at, jd_error, classified_by, classified_model).
create or replace view roles_public as
  select id, company_id, title, role_type, lifecycle, posted_at, deadline, link, source,
         visa_class, eligible, eligibility_note, location, season, family,
         jd_snapshot, jd_snapshot_at, created_at, updated_at,
         families, classified_at,
         last_seen_at, repost_count, canonical_key, gate_checked_at,
         source_posted_at, level
  from roles;

create or replace view companies_public as
  select id, name, tier, careers_url, link, visa_note
  from companies;

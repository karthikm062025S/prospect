-- v7: public multi-tenant. Idempotent.
-- Paste 1: additive schema, owner backfill, and RLS policies.

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  saved_at timestamptz,
  hidden_at timestamptz,
  apply_clicked_at timestamptz,
  deleted_at timestamptz,
  application_id uuid references public.applications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index if not exists user_roles_application_idx on public.user_roles (application_id) where application_id is not null;
create index if not exists user_roles_user_saved_idx on public.user_roles (user_id, saved_at desc) where saved_at is not null;
create index if not exists user_roles_user_hidden_idx on public.user_roles (user_id) where hidden_at is not null or deleted_at is not null or application_id is not null;

alter table public.applications add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.applications add column if not exists role_id uuid references public.roles(id) on delete set null;
create index if not exists applications_user_status_idx on public.applications (user_id, status, updated_at desc);
alter table public.outreach add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists outreach_user_idx on public.outreach (user_id, updated_at desc);
alter table public.application_events add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists application_events_user_idx on public.application_events (user_id, application_id);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  page text,
  message text not null check (char_length(message) between 1 and 2000),
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_day_idx on public.feedback (user_id, created_at desc);
create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.roles add column if not exists season text not null default 'unspecified';
alter table public.roles add column if not exists family text;
create index if not exists roles_season_idx on public.roles (season) where lifecycle = 'open';

-- Backfill the single existing user (the owner) -- substitute <OWNER_UID> before running.
update public.applications set user_id = '<OWNER_UID>' where user_id is null;
update public.outreach set user_id = '<OWNER_UID>' where user_id is null;
update public.application_events e set user_id = a.user_id from public.applications a where e.application_id = a.id and e.user_id is null;
insert into public.user_roles (user_id, role_id, saved_at, hidden_at, apply_clicked_at, application_id)
  select '<OWNER_UID>', r.id, r.saved_at, r.hidden_at, r.apply_clicked_at, r.application_id
  from public.roles r
  where r.saved_at is not null or r.hidden_at is not null or r.apply_clicked_at is not null or r.application_id is not null
on conflict (user_id, role_id) do nothing;
update public.applications a set role_id = r.id from public.roles r where r.application_id = a.id and a.role_id is null;
-- Applied is per-user now (user_roles.application_id); the owner's legacy applies go back into the shared feed (V1).
update public.roles set lifecycle = 'open' where lifecycle = 'applied';
alter table public.applications alter column user_id set not null;
alter table public.outreach alter column user_id set not null;

alter table public.roles enable row level security;
alter table public.companies enable row level security;
alter table public.user_roles enable row level security;
alter table public.applications enable row level security;
alter table public.outreach enable row level security;
alter table public.application_events enable row level security;
alter table public.feedback enable row level security;

-- Shared feed is exposed through COLUMN-LIMITED views (audit M2, 2026-09-02): the base
-- tables stay deny-all for authenticated, so the owner's personal columns on roles
-- (saved_at/hidden_at/apply_clicked_at/application_id/notes/fit_note/priority) and the
-- scanner internals on companies (endpoint/watch_status/is_watched/notes) are never readable.
-- The views are security-definer by design (owner postgres, bypass RLS) — Supabase's
-- "security definer view" advisor warning is expected here.
drop policy if exists roles_read_authenticated on public.roles;
drop policy if exists companies_read_authenticated on public.companies;
create or replace view public.roles_public as
  select id, company_id, title, role_type, lifecycle, posted_at, deadline, link, source,
         visa_class, eligible, eligibility_note, location, season, family,
         jd_snapshot, jd_snapshot_at, created_at, updated_at
  from public.roles;
create or replace view public.companies_public as
  select id, name, tier, careers_url, link, visa_note
  from public.companies;
revoke all on public.roles_public from anon, authenticated;
revoke all on public.companies_public from anon, authenticated;
grant select on public.roles_public to authenticated;
grant select on public.companies_public to authenticated;

-- Per-user tables: one owner-only policy per verb.
drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles for select to authenticated using (user_id = auth.uid());
drop policy if exists user_roles_insert_own on public.user_roles;
create policy user_roles_insert_own on public.user_roles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists user_roles_update_own on public.user_roles;
create policy user_roles_update_own on public.user_roles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists user_roles_delete_own on public.user_roles;
create policy user_roles_delete_own on public.user_roles for delete to authenticated using (user_id = auth.uid());

drop policy if exists applications_select_own on public.applications;
create policy applications_select_own on public.applications for select to authenticated using (user_id = auth.uid());
drop policy if exists applications_insert_own on public.applications;
create policy applications_insert_own on public.applications for insert to authenticated with check (user_id = auth.uid());
drop policy if exists applications_update_own on public.applications;
create policy applications_update_own on public.applications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists applications_delete_own on public.applications;
create policy applications_delete_own on public.applications for delete to authenticated using (user_id = auth.uid());

drop policy if exists outreach_select_own on public.outreach;
create policy outreach_select_own on public.outreach for select to authenticated using (user_id = auth.uid());
drop policy if exists outreach_insert_own on public.outreach;
create policy outreach_insert_own on public.outreach for insert to authenticated with check (user_id = auth.uid());
drop policy if exists outreach_update_own on public.outreach;
create policy outreach_update_own on public.outreach for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists outreach_delete_own on public.outreach;
create policy outreach_delete_own on public.outreach for delete to authenticated using (user_id = auth.uid());

drop policy if exists application_events_select_own on public.application_events;
create policy application_events_select_own on public.application_events for select to authenticated using (user_id = auth.uid());
drop policy if exists application_events_insert_own on public.application_events;
create policy application_events_insert_own on public.application_events for insert to authenticated with check (user_id = auth.uid());
drop policy if exists application_events_update_own on public.application_events;
create policy application_events_update_own on public.application_events for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists application_events_delete_own on public.application_events;
create policy application_events_delete_own on public.application_events for delete to authenticated using (user_id = auth.uid());

-- SR-001 (security review 2026-09-03): NO insert policy on feedback. The anon
-- key ships in the browser bundle, so an anon insert grant makes PostgREST the
-- write path and the app's 10/day + 200/day caps advisory. Feedback is written
-- by lib/feedback-server.ts's insertFeedback() with the service role, after
-- those caps run. RLS stays enabled with select-own only, so the table is
-- unreachable from any client key.
drop policy if exists feedback_insert_own on public.feedback;
drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own on public.feedback for select to authenticated using (user_id = auth.uid());
-- D-CUT lives in db/migration-2026-09-v7-public.cut.sql (paste 2, after the L2 deploy; audit M1).

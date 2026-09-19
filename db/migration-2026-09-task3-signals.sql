-- Task 3 (signals ledger, phase B+C), 2026-09-16. Additive, idempotent, one paste.
-- Apply AFTER db/migration-2026-09-task2-classify.sql (the view below re-lists its columns).
-- Down: the four columns and the table can be dropped; the view reverts to the task2 file's shape.

-- T2 liveness on the row; T3 identity; T4 sweep audit stamp.
alter table public.roles
  add column if not exists last_seen_at timestamptz,
  add column if not exists repost_count integer not null default 0,
  add column if not exists canonical_key text,
  add column if not exists gate_checked_at timestamptz;

alter table public.roles drop constraint if exists roles_repost_count_check;
alter table public.roles
  add constraint roles_repost_count_check check (repost_count >= 0);

-- Backfill last_seen_at from the best evidence we have so no live row reads "never seen".
update public.roles set last_seen_at = coalesce(updated_at, created_at) where last_seen_at is null;

-- Ingest looks a role up by key first (oldest row wins), so the key is a hot filter.
create index if not exists roles_canonical_key_idx on public.roles (canonical_key) where canonical_key is not null;
-- The gate sweep reads rows with a JD not yet checked, oldest first.
create index if not exists roles_gate_residue_idx
  on public.roles (created_at) where jd_snapshot is not null and gate_checked_at is null;

-- T5 corrections: a per-user signal, never a write to roles.
create table if not exists public.role_corrections (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  field text not null check (field in ('season', 'family', 'visa_class')),
  value text not null check (length(value) between 1 and 40),
  -- Per-field allowed values (mirrors lib/corrections.ts; a remappable CHECK, widen it when a list grows).
  constraint role_corrections_value_check check (
    (field = 'season' and value in ('summer_2027','fall_2027','spring_2028','summer_2028','coop','unspecified'))
    or (field = 'family' and value in ('swe','ai_ml','data','quant','product','security','hardware','design','other'))
    or (field = 'visa_class' and value in ('clean','question','no_sponsors','citizen_required'))
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, role_id, field)
);
create index if not exists role_corrections_user_idx on public.role_corrections (user_id);

alter table public.role_corrections enable row level security;
drop policy if exists role_corrections_select_own on public.role_corrections;
drop policy if exists role_corrections_insert_own on public.role_corrections;
drop policy if exists role_corrections_update_own on public.role_corrections;
drop policy if exists role_corrections_delete_own on public.role_corrections;
create policy role_corrections_select_own on public.role_corrections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy role_corrections_insert_own on public.role_corrections
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy role_corrections_update_own on public.role_corrections
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy role_corrections_delete_own on public.role_corrections
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.role_corrections from anon;
grant select, insert, update, delete on public.role_corrections to authenticated;

-- CREATE OR REPLACE VIEW may only APPEND columns, so the new ones go last (after task2's).
create or replace view public.roles_public as
  select id, company_id, title, role_type, lifecycle, posted_at, deadline, link, source,
         visa_class, eligible, eligibility_note, location, season, family,
         jd_snapshot, jd_snapshot_at, created_at, updated_at,
         families, classified_at,
         last_seen_at, repost_count, canonical_key, gate_checked_at
  from public.roles;

-- Verify (expect 4 rows; then the view lists the four new columns last; then 0 rows with a null last_seen_at):
-- select column_name from information_schema.columns
--   where table_name = 'roles' and column_name in ('last_seen_at','repost_count','canonical_key','gate_checked_at');
-- select column_name from information_schema.columns where table_name = 'roles_public' order by ordinal_position;
-- select count(*) from public.roles where last_seen_at is null;
-- select policyname from pg_policies where tablename = 'role_corrections';  -- expect 4

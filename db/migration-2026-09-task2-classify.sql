-- Task 2 (2026-09-15): multi-label family + classifier audit stamps. Additive,
-- idempotent, safe to re-run. Apply in the Supabase SQL editor BEFORE the Task 2
-- app build is deployed (the app selects `families` from roles_public).
--
-- families:   every family that fits the role (text[] of lib/family.ts Family
--             values); `family` stays the PRIMARY and keeps its meaning.
--             NULL = not yet classified beyond the title; the app derives from
--             the title at read time until a value lands here.
-- classified_*: who last wrote families/season beyond the title rules:
--             'rules' (deterministic re-run over the JD text) or 'llm'
--             (model name in classified_model). NULL = never swept.

alter table public.roles
  add column if not exists families text[],
  add column if not exists classified_by text,
  add column if not exists classified_model text,
  add column if not exists classified_at timestamptz;

alter table public.roles drop constraint if exists roles_classified_by_check;
alter table public.roles
  add constraint roles_classified_by_check
  check (classified_by is null or classified_by in ('rules', 'llm'));

-- The residue sweep reads open roles never classified, oldest first.
create index if not exists roles_classify_residue_idx
  on public.roles (created_at)
  where lifecycle = 'open' and classified_at is null;

-- CREATE OR REPLACE VIEW may only APPEND columns, so the new ones go last.
-- Grants on the view survive a replace (verified pattern: v7-public.sql).
create or replace view public.roles_public as
  select id, company_id, title, role_type, lifecycle, posted_at, deadline, link, source,
         visa_class, eligible, eligibility_note, location, season, family,
         jd_snapshot, jd_snapshot_at, created_at, updated_at,
         families, classified_at
  from public.roles;

-- Verify (expect 4 rows, then the view to list families + classified_at):
-- select column_name from information_schema.columns
--   where table_name = 'roles' and column_name in ('families','classified_by','classified_model','classified_at');
-- select column_name from information_schema.columns where table_name = 'roles_public' order by ordinal_position;

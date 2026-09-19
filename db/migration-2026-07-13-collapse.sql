-- Scout minimal rebuild — one-time migration (2026-07-13)
-- Collapses roles.lifecycle 8 states -> open|applied, adds the tombstone table,
-- hard-deletes the already-dismissed roles. Verified against live DB before writing:
--   lifecycle is TEXT, no pre-existing CHECK constraint, posted_at is DATE.
--   Blast radius: rejected 60 + archived 52 = 112 tombstoned+deleted;
--   needs_review 15 -> open; applied 12 + 21 applications preserved.
-- Idempotent (IF NOT EXISTS + WHERE guards) and atomic (one transaction).
-- A full pre-migration JSON backup of every affected table was taken first.

begin;

-- Tombstone table: remembers a hard-deleted posting by the SAME
-- (company_id, title, posted_at) dedup identity upsertRole checks, so the
-- watcher can never re-insert a role Karthik deleted. Service role only
-- (RLS on, no policies). ON DELETE CASCADE so deleting a company clears its
-- tombstones too (companies delete guard already blocks apps-bearing companies).
create table if not exists public.tombstones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  title text not null,
  posted_at date,
  link text,
  created_at timestamptz not null default now()
);
create index if not exists tombstones_lookup_idx on public.tombstones (company_id, title);
alter table public.tombstones enable row level security;

-- 1. Tombstone + delete the already-dismissed roles (rejected 60 + archived 52).
insert into public.tombstones (company_id, title, posted_at, link)
  select company_id, title, posted_at, link from public.roles
  where lifecycle in ('rejected', 'archived');
delete from public.roles where lifecycle in ('rejected', 'archived');

-- 2. Collapse the surviving non-applied states (needs_review 15) to 'open';
--    the 12 'applied' roles + their 21 applications are preserved untouched.
update public.roles set lifecycle = 'open' where lifecycle <> 'applied';

-- 3. Enforce the collapsed model going forward.
alter table public.roles add constraint roles_lifecycle_check check (lifecycle in ('open', 'applied'));
alter table public.roles alter column lifecycle set default 'open';

commit;

-- Verify (run after):
-- select lifecycle, count(*) from public.roles group by lifecycle;   -- expect open 15, applied 12
-- select count(*) from public.tombstones;                            -- expect 112

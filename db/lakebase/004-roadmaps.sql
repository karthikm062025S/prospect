-- L3b lane (Roadmap agent + Journey UI), 2026-09-19. Additive, idempotent, one paste.
-- Owner: L3b. Plain Postgres 17 (Databricks Lakebase). No auth.* here -- Supabase is
-- auth only; user_id is a bare uuid validated by lib/require-user.ts, and every
-- roadmap_nodes/roadmaps query carries `where user_id = $n` in the app layer (the
-- D4 pattern from db/lakebase/002-profiles.sql).
-- Apply: psql "$LAKEBASE_URL" -f db/lakebase/004-roadmaps.sql
-- Down: both tables can be dropped; nothing else depends on them yet.

-- One roadmap per student (unique user_id). Nodes come only from Delta rows
-- (courses/clubs) or live-grounded certifications, or are labeled 'suggested'
-- projects -- never invented (CONTEXT 13:25, MISSION invariant 1).
create table if not exists roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  goal text,
  target_term text not null,
  agent_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists roadmap_nodes (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references roadmaps(id) on delete cascade,
  user_id uuid not null,
  semester text not null,
  kind text not null check (kind in ('course', 'club', 'project', 'certification')),
  ref_code text,
  ref_name text,
  title text not null,
  why text not null,
  unlocks_tasks jsonb not null default '[]',
  moves_toward jsonb not null default '[]',
  source_url text,
  status text not null check (status in ('suggested', 'planned', 'done')),
  notes text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every read/write from the app filters by (user_id, semester); the Journey
-- timeline also orders by position within a semester.
create index if not exists roadmap_nodes_user_semester_idx on roadmap_nodes (user_id, semester, position);

-- L2b lane (archetype registry + posting -> O*NET task exposure mapping), 2026-09-19.
-- Additive, idempotent, one paste. Owner: L2b.
-- Apply: psql "$LAKEBASE_URL" -f db/lakebase/005-archetypes.sql
-- Down: drop table role_tasks; drop table role_archetypes; drop table archetypes.
--
-- Lakebase holds the registry the app reads (this file). The Delta mirror used
-- by Vector Search (`scout.core.archetypes`) is written separately by
-- scripts/seed-archetypes.mjs and lib/archetypes.ts through executeStatement --
-- the two copies are kept in sync by the seed script and by assignArchetype's
-- provisional-insert path, never by a DB-level replication mechanism.
--
-- `role_id` on role_archetypes/role_tasks is deliberately a bare uuid, NOT a
-- foreign key to `roles(id)`: the `roles` table is owned by L0's
-- 001-schema.sql, which has not merged yet at the time this file was written
-- (L2b's fence never touches L0's files). Ownership/existence of the role row
-- is enforced by the caller (the Match agent, L2c), the same pattern D4 uses
-- for Supabase-Auth user ids elsewhere in this port.

-- The dynamic, open-vocabulary archetype registry (CONTEXT "Archetypes locked
-- 2026-09-19 12:50"). One row per named archetype, confirmed by a human
-- (seed review) or provisional (Gemini proposed it for one posting and no
-- human has merged/confirmed it yet -- no automatic merges).
create table if not exists archetypes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  definition text not null,
  aliases text[] not null default '{}',
  status text not null check (status in ('confirmed', 'provisional')),
  evidence_role_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One archetype per posting: the nearest-definition retrieval (Vector Search)
-- that Gemini confirmed, or the provisional archetype it proposed instead.
create table if not exists role_archetypes (
  role_id uuid primary key,
  archetype_id uuid not null references archetypes (id),
  confidence double precision,
  decided_by text not null check (decided_by in ('vector', 'gemini')),
  created_at timestamptz not null default now()
);

create index if not exists role_archetypes_archetype_idx on role_archetypes (archetype_id);

-- Every duty statement Gemini extracted from one posting, mapped to its
-- nearest O*NET task and labeled ONLY from the published exposure table
-- (a task with no exposure row is 'unscored', never
-- guessed). Replaced wholesale per role on every re-run (delete then insert).
create table if not exists role_tasks (
  role_id uuid not null,
  position int not null,
  duty text not null,
  onet_task_id text,
  onet_soc_code text,
  similarity double precision,
  label text not null check (label in ('human_led', 'ai_assisted', 'automatable', 'unscored')),
  automation_share double precision,
  created_at timestamptz not null default now(),
  primary key (role_id, position)
);

-- Owner lane: L4 (Orchestrator job + classifier + MLflow), 2026-09-19.
-- Apply AFTER db/lakebase/001-schema.sql (the `roles` table must exist for the FK).
-- Apply command: psql "$LAKEBASE_URL" -f db/lakebase/003-nudges.sql
-- Down: drop index nudges_user_unread_idx; drop table nudges.
-- One row per Orchestrator/Match-agent write: a new-drop match, a re-plan, or an
-- approaching deadline, surfaced on the Journey screen. No mock rows — only the
-- Orchestrator (a later leaf) and lib/nudges.ts write here.

create table if not exists nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role_id uuid references roles(id) on delete cascade,
  kind text not null check (kind in ('new_drop', 'replan', 'deadline')),
  title text not null,
  body text not null,
  evidence jsonb not null default '{}',
  agent_run_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists nudges_user_unread_idx
  on nudges (user_id, created_at desc)
  where read_at is null;

-- L1 lane (onboarding + Profile agent), 2026-09-19. Additive, idempotent, one paste.
-- Owner: L1 (Profile agent + /setup). Plain Postgres 17 (Databricks Lakebase). No auth.* here:
-- Supabase is auth only, so user_id is a bare uuid with no local FK -- ownership is enforced in
-- the app layer via lib/require-user.ts + `where user_id = $1` on every query (D4).
-- Apply: psql "$LAKEBASE_URL" -f db/lakebase/002-profiles.sql
-- Down: both tables can be dropped; nothing else in this file depends on them yet.

-- One row per student. `profile` is the full validated ProfileSchema output (courses, skills,
-- experiences); the flat columns beside it are the fields other lanes (Match, Roadmap) filter and
-- join on, so they don't have to reach into JSON on every query.
create table if not exists profiles (
  user_id uuid primary key,
  profile jsonb not null,
  major text,
  grad_term text,
  work_authorization text,
  goal text,
  target_term text,
  role_types text[],
  dream_tier text[],
  agent_run_id uuid,
  updated_at timestamptz not null default now()
);

-- Every agent's run history (Profile tonight; Match/Roadmap/Orchestrator write the same shape
-- later). One row per run, started eagerly and finished on success or error so a crash mid-run
-- still leaves a named 'running' row behind instead of nothing.
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  user_id uuid,
  status text not null check (status in ('running', 'ok', 'error')),
  error text,
  counts jsonb,
  mlflow_trace_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Settings/Journey re-ingest and the Match/Roadmap agents look up a user's latest run by agent.
create index if not exists agent_runs_user_agent_idx on agent_runs (user_id, agent, started_at desc);

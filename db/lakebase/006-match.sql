-- L2c lane (Match agent + Home card fields), 2026-09-19. Additive, idempotent, one paste.
-- Owner: L2c. Apply: psql "$LAKEBASE_URL" -f db/lakebase/006-match.sql
-- Down: drop table match_scores.
--
-- One row per (user, posting): the Match agent's full-feed score, the printed
-- reasons, requirements met/unknown (top 40 only -- requirements_checked is
-- false for the rest, CONTEXT "requirements not yet checked"), and the
-- before-you-apply roadmap nodes (top 40 only, [] otherwise). Written wholesale
-- per user by lib/match-scores.ts replaceScores, called inside lib/db.ts
-- withTransaction (delete then insert, one atomic unit -- a failing row rolls
-- back the delete too, leaving the previous set intact).
--
-- role_id references roles(id) directly (unlike role_archetypes/role_tasks in
-- 005-archetypes.sql, which predate L0's merge): 001-schema.sql is already on
-- disk by the time this lane starts, so the FK is safe here.
create table if not exists match_scores (
  user_id uuid not null,
  role_id uuid not null references roles (id) on delete cascade,
  score double precision not null,
  archetype_similarity double precision,
  level_match boolean,
  tier_match boolean,
  reasons jsonb not null default '[]',
  requirements_met jsonb not null default '[]',
  requirements_unknown jsonb not null default '[]',
  requirements_checked boolean not null default false,
  before_you_apply jsonb not null default '[]',
  target_archetype text,
  agent_run_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists match_scores_user_score_idx on match_scores (user_id, score desc);

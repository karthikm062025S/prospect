-- Speed lane (D-S4, build/MISSION-speed-2026-09-20.md), 2026-09-20. Additive, idempotent, one paste.
-- Apply: node --env-file=.env.local scripts/apply-schema.mjs   (or psql "$LAKEBASE_URL" -f db/lakebase/007-catalog.sql)
-- Then load: node --env-file=.env.local scripts/load-lakebase-catalog.mjs
-- Down: drop table task_exposure; drop table vt_clubs; drop table vt_courses;
--
-- Lakebase copies of the three catalog datasets the app READS on a user path
-- (roadmap candidates, the add-node typeahead, catalog validation, task-exposure
-- labels). The Delta copies in scout.core.* stay for Vector Search, Genie and the
-- judges; this is the low-latency read side (one parameterized statement, ~ms,
-- instead of a SQL-warehouse Statement Execution round trip of 1-5 s+).
create extension if not exists pg_trgm;

create table if not exists vt_courses (
  code        text primary key,
  title       text not null,
  description text not null default '',
  credits     numeric,
  department  text,
  level       int,
  prereqs     text
);

create table if not exists vt_clubs (
  name        text primary key,
  description text not null default '',
  category    text,
  url         text
);

-- Labels come ONLY from this table (MISSION invariant 2): a task with no row is 'unscored'.
create table if not exists task_exposure (
  task_id            text primary key,
  automation_share   numeric not null,
  augmentation_share numeric not null
);

create index if not exists vt_courses_title_trgm_idx on vt_courses using gin (title gin_trgm_ops);
create index if not exists vt_courses_code_trgm_idx on vt_courses using gin (code gin_trgm_ops);
create index if not exists vt_clubs_name_trgm_idx on vt_clubs using gin (name gin_trgm_ops);

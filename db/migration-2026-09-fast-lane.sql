-- Fast discovery lane migration (2026-09, RB-082 v2, slice 6c-finish) — TRD §10.
-- Additive only, zero data loss; idempotent (if not exists guards; the cron row
-- is unscheduled-then-scheduled so a re-run replaces, never duplicates).
-- Apply through the Supabase SQL editor; record in migration-2026-09-fast-lane.log.md.
--
-- ORDER: the Vault secret (step 3 in the .log.md, Karthik runs it himself with
-- the real value) must exist BEFORE the cron row below fires, or every call goes
-- out with a NULL header and gets a 401 from /api/scan.

-- 1. watch_state: one row per vendor URL the fast lane fetches with a GET
--    (Greenhouse / Lever / Ashby send validators; Workday is POST-only and has
--    no row). endpoint_key = the full URL (lib/etag-fetch.ts ponytail note).
create table if not exists watch_state (
  endpoint_key text primary key,
  etag text,
  last_modified text,
  checked_at timestamptz
);
-- house convention (verified live 2026-08-24): every table has RLS enabled, no
-- policies — server code uses the service role; the anon key sees nothing.
alter table watch_state enable row level security;

-- 2. MISSION A5: two overlapping lanes (Actions cron + this one) could both
--    insert a brand-new role before either sees the other's row. The dedup
--    triple lib/upsert-role.ts already looks up becomes a real constraint;
--    `nulls not distinct` (PG15+) makes posted_at = NULL rows dedup too, which
--    is exactly how the lookup treats them (`.is("posted_at", null)`).
--    Run ONLY after the duplicate pre-check in the .log.md is empty
--    (it was run on the live table 2026-08-24: 653 rows, 0 duplicate groups).
create unique index if not exists roles_dedup_uidx
  on roles (company_id, title, posted_at) nulls not distinct;

-- 3. pg_cron + pg_net (both bundled with Supabase; free tier).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 4. The watcher secret lives in Vault under the name 'watcher_secret' —
--    created by Karthik with the REAL value (see the .log.md, step 3). NEVER
--    in this file.

-- 5. The schedule — INTERIM cadence from the spike-5 verdict (TRD §13): hot tier
--    every 30 min, NO full tier (48 × 6.3 CPU-s/day ≈ 2.5 CPU-h/month against
--    Hobby's 4 h). Cadence is LOCKED only after the ETag re-measure (orchestrator);
--    the full-tier row is added then if the CPU budget allows.
--    timeout 5 s: the route answers 202 in <0.4 s and does the work in after().
select cron.unschedule('scout-fast-hot')
  where exists (select 1 from cron.job where jobname = 'scout-fast-hot');
select cron.schedule(
  'scout-fast-hot',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://intern-hq-inky.vercel.app/api/scan?tier=hot',
    headers := jsonb_build_object(
      'X-Watcher-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'watcher_secret'),
      'content-type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  )
  $$
);

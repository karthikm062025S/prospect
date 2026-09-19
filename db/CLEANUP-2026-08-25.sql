-- Post-v5 cleanup (2026-08-25). ONE paste for Karthik in the Supabase SQL editor.
-- Prepared by the orchestrator; execution deliberately left to Karthik (destructive ops).

-- A. email_rules: created by migration-2026-09-rebuild.sql for the Gmail status lane
--    (cut 2026-08-25, merge adfca98). Verified live 2026-08-25: 0 rows, no reader, no
--    writer. Zero data loss. Recommendation: run.
drop table if exists email_rules;

-- B. Orphan application_events (application_id IS NULL): 1,002 rows the cut lane captured
--    but never matched to an application; unreachable from the UI since the Inbox strip and
--    linkEventAction were removed; none auto_applied; Gmail still holds every original.
--    Manual Timeline entries always carry an application_id, so this cannot touch anything
--    Karthik wrote. Recommendation: run.
delete from application_events where application_id is null;

-- verification (expect: email_rules=0, orphans=0, matched=69)
select 'email_rules' as chk, count(*)::text as val from pg_tables where tablename = 'email_rules'
union all select 'orphans', count(*)::text from application_events where application_id is null
union all select 'matched', count(*)::text from application_events where application_id is not null;

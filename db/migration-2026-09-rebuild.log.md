# Migration log: `migration-2026-09-rebuild.sql`

- Date written: 2026-08-23 (build session, s1-migration-types)
- Applied: 2026-08-24 (~13:10Z), Supabase SQL editor via Chrome, standing approval 2026-08-23. Two `enable row level security` lines added to the migration first, matching the live convention (all 5 existing tables have RLS on, no policies; server code is service-role).

## BEFORE row counts (from `db/baseline-2026-09/counts.json`, dumped 2026-08-24T01:28:43.243Z)

| table | count |
| --- | --- |
| companies | 493 |
| roles | 624 |
| applications | 40 |
| outreach | 4 |
| tombstones | 401 |
| drops | 0 |
| tasks | 0 |
| prep_items | 0 |

## AFTER row counts (2026-08-24 ~13:12Z, SQL editor)

| table | count | vs before |
| --- | --- | --- |
| companies | 493 | = |
| roles | 638 | +14 — NOT the migration: +12 from the Phase-A verification fire of the fast lane on the preview (`inserted:12`, 2026-08-24 13:02Z log line) and +2 from the overnight Actions scans between the baseline dump (08-24 01:28Z) and apply. The migration adds columns only. |
| applications | 40 | = |
| outreach | 4 | = |
| tombstones | 401 | = |
| drops | 0 | = |
| tasks | 0 | = |
| prep_items | 0 | = |

## Verification results (2026-08-24, all pass)

| query | expected | got |
| --- | --- | --- |
| q1 `status_changed_at is null` | 0 | 0 |
| q2 applications new columns | 5 | 5 |
| q3 roles `apply_clicked_at` | 1 | 1 |
| q4 `application_events` rows | 0 | 0 |
| q5 `email_rules` rows | 0 | 0 |
| q6 new indexes | 3 | 3 |
| RLS enabled on the 2 new tables | 2 | 2 |

Additive-only migration (PRD RB-051): all pre-existing tables must show the
SAME counts after applying. `applications` gains 5 nullable columns (no rows
added/removed); `roles` gains 1 nullable column; `application_events` and
`email_rules` are new, empty tables (0 rows expected after apply).

## Verification queries (paste into the SQL editor after applying)

```sql
-- expect 0 (backfill covered every existing row)
select count(*) from applications where status_changed_at is null;

-- expect 5
select column_name from information_schema.columns
where table_name = 'applications'
  and column_name in ('follow_up_at','next_action','jd_snapshot','jd_snapshot_at','status_changed_at');

-- expect 1 row: apply_clicked_at
select column_name from information_schema.columns
where table_name = 'roles' and column_name = 'apply_clicked_at';

-- expect 0 (new, empty table)
select count(*) from application_events;

-- expect 0 (new, empty table)
select count(*) from email_rules;

-- expect 3 rows
select indexname from pg_indexes
where indexname in ('roles_open_created_idx','applications_date_idx','application_events_app_idx');
```

# Migration log: `migration-2026-09-fast-lane.sql`

- **APPLIED 2026-08-25 13:50Z** via `db/APPLY-2026-08-24.sql` (Supabase SQL editor). Verification: vault=1, tmpfn=0, v5cols=6, watch_state_rls=true, dedup_idx=1, ext=pg_cron,pg_net, cron scout-fast-hot `*/30` active=true.
- Date written: 2026-08-24 (build session, s6c-fast-lane-finish)
- Applied: 2026-08-25 13:50Z (see APPLIED line above)
- Cadence status: INTERIM `*/30` hot only (TRD §13 spike-5 verdict). LOCKED only after the ETag re-measure; the full-tier `cron.schedule` row is added then if the CPU budget allows.

## Order of operations (reordered 2026-08-24 after the S6c audit: DEPLOY FIRST — `/api/scan` does not exist in production until master is pushed, so any cron row or 202 check before that gets a 404)

0. **Deploy** master (orchestrator, Karthik's go) and confirm `POST https://intern-hq-inky.vercel.app/api/scan` answers 401 without the header (route exists). Add `GITHUB_ISSUES_PAT` to the Vercel project env (Karthik; see step 6 for WHICH account's PAT).
1. Duplicate pre-check (below) — must return 0 rows.
2. Vault secret (Karthik only, below) — must exist before the cron row fires.
3. Paste `db/migration-2026-09-fast-lane.sql` whole (creates `watch_state`, the index, the extensions, AND the `*/30` cron row — the lane is ARMED from this paste).
4. Verification queries (below); fill the AFTER table.
5. pg_net 202 confirmation (below), then the Vercel runtime log line.
6. **Notification path (Karthik only; MAJOR finding, S6c audit).** A PAT minted from Karthik's OWN account makes the issue/comment authored by `karthikm062025S` @mentioning `@karthikm062025S` — GitHub does NOT email you for your own activity by default, so the fast lane's alert would silently never arrive while the log says `notify:"created"`. The Actions lane works only because `github-actions[bot]` is the author. Pick ONE: (a) GitHub → Settings → Notifications → tick **"Include your own updates"** (simplest, one checkbox), or (b) mint the PAT from a separate bot account added as a collaborator (issues:write) so the author differs. The live check for this step is **"the phone received the @mention email"** for a fast-lane-inserted role — never "202 received".

## 1. Duplicate pre-check (MISSION A5) — run BEFORE the unique index

```sql
-- expect 0 rows. If ANY come back: list them for Karthik, do NOT auto-delete;
-- the index statement in the .sql must not run until this is empty.
select company_id, title, posted_at, count(*)
from roles
group by company_id, title, posted_at
having count(*) > 1;
```

**Run 2026-08-24 by the orchestrator on the LIVE `roles` table (653 rows): 0 duplicate groups.** The `roles_dedup_uidx` statement can run as-is when the migration is applied. (Re-run the pre-check right before applying if more than a few scan cycles have passed — an overlap between the Actions cron and the preview fires is the one way a duplicate could appear in the meantime.)

## 2. Vault secret (Karthik runs this himself — the value never enters the repo)

```sql
-- Paste the WATCHER_SECRET value from Vercel env (same value the Actions jobs
-- send). The name 'watcher_secret' is what the cron row reads.
select vault.create_secret('<WATCHER_SECRET value>', 'watcher_secret');

-- confirm (shows the name, not the value)
select name, created_at from vault.secrets where name = 'watcher_secret';
```

## BEFORE row counts (fill from the SQL editor right before applying)

| table | count |
| --- | --- |
| companies | |
| roles | 653 (orchestrator pre-check, 2026-08-24) |
| applications | |
| outreach | |
| tombstones | |
| application_events | |
| email_rules | |
| watch_state | n/a (table does not exist yet) |

## AFTER row counts (fill after applying)

| table | count | vs before |
| --- | --- | --- |
| companies | | = expected |
| roles | | = expected (only watcher-lane inserts between the two counts may differ) |
| applications | | = expected |
| outreach | | = expected |
| tombstones | | = expected |
| application_events | | = expected |
| email_rules | | = expected |
| watch_state | 0 | new, empty; the first fast-lane run after deploy fills it |

Additive-only migration: no pre-existing row is added, removed or changed. `watch_state` is new and empty; the unique index is a constraint over data already proven duplicate-free.

## 4. Verification queries (paste after applying)

```sql
-- expect 1 row: watch_state with RLS on
select relname, relrowsecurity from pg_class where relname = 'watch_state';

-- expect 1 row: the dedup index, unique, nulls not distinct
select indexname, indexdef from pg_indexes where indexname = 'roles_dedup_uidx';

-- expect 2 rows: pg_cron, pg_net
select extname from pg_extension where extname in ('pg_cron', 'pg_net');

-- expect 1 row: scout-fast-hot, '*/30 * * * *', active = true
select jobname, schedule, active from cron.job where jobname = 'scout-fast-hot';
```

| query | expected | got |
| --- | --- | --- |
| watch_state + RLS | 1 row, `relrowsecurity = true` | |
| roles_dedup_uidx | 1 row, `UNIQUE ... NULLS NOT DISTINCT` | |
| extensions | 2 | |
| cron.job | 1 row, `*/30 * * * *`, active | |

## 5. pg_net 202 confirmation (Karthik, one paste; proves the cron body works end to end)

```sql
-- fires ONE real hot-tier scan right now (same call the cron row makes)
select net.http_post(
  url := 'https://intern-hq-inky.vercel.app/api/scan?tier=hot',
  headers := jsonb_build_object(
    'X-Watcher-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'watcher_secret'),
    'content-type', 'application/json'
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 5000
);

-- wait ~2 s, then: expect status_code = 202 and content like {"accepted":true,"tier":"hot","endpoints":232}
select id, status_code, content, error_msg, created
from net._http_response
order by id desc
limit 1;

-- after the cron has run at least once: expect status_code 202 on every row
select runid, status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'scout-fast-hot')
order by start_time desc
limit 5;
```

| check | expected | got |
| --- | --- | --- |
| one-off `net.http_post` → `_http_response.status_code` | 202 | |
| `cron.job_run_details` latest status | succeeded | |
| Vercel runtime log line `{"lane":"fast","tier":"hot",...,"etag_hits":N,...}` | present within ~60 s | |

## Rollback (each independent; the .sql is idempotent so re-applying is safe)

```sql
-- stop the lane (keeps everything else)
select cron.unschedule('scout-fast-hot');

-- drop the validator cache (the next run simply re-harvests)
drop table if exists watch_state;

-- drop the dedup constraint (only if it ever blocks a legitimate insert)
drop index if exists roles_dedup_uidx;
```

## Cadence lock (orchestrator fills after the ETag re-measure)

| run | tier | endpoints | etag_sent | etag_hits | ms | cpu_ms |
| --- | --- | --- | --- | --- | --- | --- |
| cold (empty watch_state) | hot | 232 | 0 | 0 | 39459 | 6815 |
| warm (2nd run, 14:30Z fire) | hot | 232 | 117 | 65 | 40404 | 6695 |
| warm | full | 999 | unmeasured | unmeasured | unmeasured | unmeasured |

Re-measure (2026-08-25, both fires against the live `scout-fast-hot` cron, prod `intern-hq-inky.vercel.app`, `vercel logs --json`):
- Cold (14:00Z, `watch_state_loaded:0`): `{"lane":"fast","tier":"hot","endpoints":232,"etag_sent":0,"etag_hits":0,"watch_state_loaded":0,"watch_state_saved":117,"roles":48,"inserted":0,"updated":45,"skipped_applied":1,"skipped_tombstoned":2,"skipped_filtered":0,"errors":0,"ms":39459,"cpu_ms":6815}`
- Warm (14:30Z, `watch_state_loaded:117`): `{"lane":"fast","tier":"hot","endpoints":232,"etag_sent":117,"etag_hits":65,"watch_state_loaded":117,"watch_state_saved":51,"roles":49,"inserted":0,"updated":46,"skipped_applied":1,"skipped_tombstoned":2,"skipped_filtered":0,"errors":0,"ms":40404,"cpu_ms":6695}`
- ETag hit rate warm: 65/117 conditional requests = 55.6% 304'd, but `cpu_ms` barely moved (6815 → 6695, -1.8%) — Workday (95/232 = 41% of hot endpoints) is POST-only with no validator, so it dominates CPU regardless of ETag hits; the ETag branch is saving bandwidth/parse cost on the Greenhouse/Lever/Ashby minority, not materially cutting Active CPU on this tier.
- Full tier: **unmeasured under the ETag branch** — `scout-fast-full` cron row was never armed, so no warm-full `cpu_ms` exists. The only full-tier number on record is the PRE-ETag preview measurement from TRD §13 (2026-08-23, `intern-eelm9smy3`, no `watch_state`/conditional fetch existed yet): full (999 endpoints) = 10.3 CPU-s/run, hot (232) = 6.3 CPU-s/run. That number predates this migration's ETag branch entirely and is not a substitute for a real warm-full measurement — treat it only as a rough upper-bound sanity check, not evidence.

CPU math (warm hot, the only ETag-branch number in hand): 6695 ms = 6.695 CPU-s/run × 48 runs/day (`*/30`) = **321.4 CPU-s/day** for `scout-fast-hot` alone, against the 360 CPU-s/day headroom line — leaving only **~38.6 CPU-s/day** (≈0.8 CPU-s/run at `*/30`) for any `scout-fast-full` row to fit in. The pre-ETag full-tier number (10.3 CPU-s/run) is ~13x that remaining budget, and even a full-tier run cut by the same modest ETag effect seen on hot (-1.8%) would still be ~10.1 CPU-s/run — nowhere close. **A `scout-fast-full` `*/30` row does not fit the 360 CPU-s/day headroom on current evidence**, though this is inferred from the pre-ETag number, not a direct warm-full measurement.

Decision (LOCKED 2026-08-25, orchestrator): `scout-fast-hot` stays `*/30` (warm 6.695 CPU-s × 48/day = 321 CPU-s/day ≈ 2.7 CPU-h/month, inside Hobby's 4 h with the 360 CPU-s/day headroom line). NO `scout-fast-full` row: the only full-tier number (pre-ETag 10.3 CPU-s/run) is ~13× the ~0.8 CPU-s/run left under the line, and the warm-hot run shows ETag saves bandwidth, not CPU (6815 → 6695 ms; Workday = 95/232 hot endpoints, POST-only, no validator). Revisit only if Workday leaves the hot tier or the plan changes. The full-tier template below stays unused.

```sql
-- template for the full-tier row, added ONLY at the lock
select cron.schedule(
  'scout-fast-full',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://intern-hq-inky.vercel.app/api/scan?tier=full',
    headers := jsonb_build_object(
      'X-Watcher-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'watcher_secret'),
      'content-type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  )
  $$
);
```

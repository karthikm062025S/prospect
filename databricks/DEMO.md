# Databricks walkthrough for the judges (Prospect, VTHacks 14)

> Refreshed 2026-09-20 morning: 22 Lakebase tables, 7,590 open roles, 926 companies, 93 archetypes, all four Vector Search indexes online (archetypes, onet_tasks, vt_courses, vt_clubs). Row counts quoted below were read on 2026-09-19 evening.

One screen per Databricks piece. Every number below was read live from the
workspace on 2026-09-19 between 17:00 and 21:30 ET; re-run the named command
to refresh it. Free Edition workspace, one user (`<workspace-user>`).
Patterns come from the Databricks AI Dev Kit
(github.com/databricks-solutions/ai-dev-kit) whose skills live in
github.com/databricks/databricks-agent-skills; each screen names the skill it
followed.

## Screen 1: Lakebase, the app database

- Object: the Lakebase Postgres 16 instance the app reads and writes (18
  tables: `roles`, `companies`, `profiles`, `match_scores`, `nudges`,
  `roadmaps`, `applications`, ...). Connection string in the `scout`
  secret scope as `lakebase_url` and in Vercel as `LAKEBASE_URL`.
- Live proof: `roles` 7,483 rows, `profiles` 1, `nudges` 0
  (`select count(*) from roles` at 21:05 ET).
- What the app calls it for: every server read/write goes through
  `lib/db.ts` (`pg`); the Match agent writes `match_scores`
  (`lib/match-scores.ts`, `db/lakebase/006-match.sql`) and `nudges`
  (`lib/nudges.ts`).
- Kit doc: `databricks-lakebase` references/off-platform.md (an app on Vercel
  connects with a standard Postgres pool; we use `pg` with the connection
  string, not the `@databricks/lakebase` OAuth pool. Honest gap: no OAuth
  token rotation, a static role password in the secret).

## Screen 2: Medallion Delta tables in Unity Catalog (`scout.core`)

- Objects: `bronze_roles` / `silver_roles` (7,483 each), `silver_companies`
  925, `silver_applications` 43 (non-PII columns only), plus the reference
  tables `onet_tasks` 18,838, `task_exposure` 2,450, `archetypes` 90,
  `vt_courses` 5,956, `vt_majors` 214, `vt_checksheets` 4,830, and the new
  `orchestrator_runs` (Screen 5). Bronze is a full snapshot per sync; silver
  is `MERGE INTO` by `id` (idempotent). There are no gold tables; say
  bronze/silver only on stage.
- Live proof: the counts above from
  `select count(*) from scout.core.<table>` through the SQL Statement API
  (`lib/databricks-sql.ts`) at 21:20 ET. `silver_roles` = Lakebase `roles`
  = 7,483, so the mirror is current to the last sync.
- What the app calls it for: `lib/catalog.ts` reads courses/majors by SQL;
  `lib/exposure.ts` labels tasks from `task_exposure`
  (`automation_share <= 0.33` Human-led, `>= 0.66` Automatable, between
  AI-assisted; 2,450 of 18,838 tasks measured, the rest shown as
  "not measured").
- Kit doc: `databricks-unity-catalog` references/3-securables-ddl.md
  (`CREATE TABLE IF NOT EXISTS catalog.schema.t ... USING DELTA`).

## Screen 3: Vector Search endpoint `scout-vs`

- Objects: the one Free Edition endpoint (`scout-vs`, ONLINE), Delta-sync
  indexes with the hosted `databricks-gte-large-en` embedding:
  `scout.core.archetypes_index` READY (90 rows),
  `scout.core.onet_tasks_index` online (18,838 of 18,838 rows indexed),
  `scout.core.vt_courses_index` online (5,956 of 5,956).
  `vt_clubs_index` online (765 of 765).
- Live proof: `GET /api/2.0/vector-search/indexes/<name>` at 21:20 ET via
  `lib/vector-search.ts` `indexStatus`.
- What the app calls it for: `lib/archetypes.ts` (nearest archetype
  definition for a posting and for the student's goal),
  `lib/posting-tasks.ts` (posting duties to O*NET tasks). The Roadmap agent
  reads courses by SQL, not the index, so the demo path does not wait on
  `vt_courses_index`.
- All four indexes are online (2026-09-20); the app still fails loud (`VECTOR_SEARCH_API_ERROR`) rather than ranking on a partial index silently.
- Kit doc: `databricks-vector-search` skill (Delta-sync index over a Change
  Data Feed source, TRIGGERED pipeline).

## Screen 4: Job `scout-sync-lakebase-to-delta` (hourly at :00)

- Object: job id `473951197133128`, serverless notebook task
  `/Workspace/Users/<workspace-user>/scout/sync/sync_lakebase_to_delta`,
  cron `0 0 * * * ?` America/New_York, UNPAUSED.
- Live proof: runs `569070626514865` SUCCESS, `502515898487119` SUCCESS,
  `392200331537814` SUCCESS (the 21:00 ET scheduled run). Earlier
  `484705678820792` FAILED on psycopg2's C extension aborting the serverless
  kernel, which is why the notebook installs pure-Python `pg8000`.
- Source: `databricks/sync/sync_lakebase_to_delta.py`, payload
  `databricks/sync/job.json`, create script `databricks/sync/create-job.ps1`.
- Kit doc: `databricks-jobs` SKILL.md (no cluster config = serverless;
  `dbutils.widgets.get` for parameters) and references/triggers-schedules.md
  (cron schedule shape).

## Screen 5: Job `scout-orchestrator` (hourly at :20)

- Object: job id `963723208312586`, serverless notebook task
  `/Workspace/Users/<workspace-user>/scout/orchestrator/orchestrate`,
  cron `0 20 * * * ?` America/New_York (after the sync's :00), UNPAUSED,
  `timeout_seconds` 900, one concurrent run. Per run it reads the `scout`
  secret scope, counts Lakebase `roles` inserted since its last watermark
  (pg8000), and when there are new drops POSTs the deployed app's
  `/api/match?all=1` with `X-Watcher-Secret` (decision D17: ranking lives
  once, in the app's TypeScript Match agent, never re-implemented in
  Python). Every run appends one real row to
  `scout.core.orchestrator_runs` (started_at, finished_at, job_run_id,
  watermark, new_drops, profiles, profiles_rescored, nudges_written, status,
  error); a failed run keeps the previous watermark so its drops are
  counted again next hour.
- Live proof: job read back via `GET /api/2.2/jobs/get` with the schedule,
  timeout and `{{job.run_id}}` parameter exactly as in `job.json`. Hourly runs succeed: run ids `475631244340034` (08:20 ET), `913850061428269` (07:20), `559070492936601` (06:20) all TERMINATED SUCCESS on 2026-09-20; a failed run (`RUN_EXECUTION_ERROR`) keeps its watermark and is retried next hour.
- What the app exposes for it: `app/api/match/route.ts` (the
  `X-Watcher-Secret` + `?all=1` branch re-scores every profile and writes
  `new_drop` nudges via `lib/nudges.ts`). Check:
  `node --experimental-strip-types scripts/orchestrator-smoke.mjs`.
- Source: `databricks/orchestrator/orchestrate.py`, payload
  `databricks/orchestrator/job.json`, create script
  `databricks/orchestrator/create-job.mjs`.
- Kit doc: `databricks-jobs` SKILL.md (serverless notebook task, job
  parameters, the `{{job.run_id}}` dynamic value reference) and
  references/triggers-schedules.md (cron chosen over `periodic` because the
  run must land at :20, after the sync).
- Honest gap: the kit's `environments[].spec.dependencies` block is the
  declarative way to ship `pg8000`; the notebook keeps the sync lane's proven
  `%pip install` cell tonight (marked `note: ` in the source).

## Screen 6: Genie space "Scout: why"

- Object: space id `01f1b47306191c0faa77d51151d0cef3`, created by REST
  (`POST /api/2.0/genie/spaces`) from `databricks/genie/space.json` over
  eight `scout.core` tables (`silver_roles`, `silver_companies`,
  `archetypes`, `onet_tasks`, `task_exposure`, `vt_courses`, `vt_majors`,
  `vt_checksheets`), on the Serverless Starter Warehouse, with six sample
  questions, three example SQLs, two join specs and text instructions that
  carry the app's own definitions (open = `lifecycle = 'open'`, the three
  exposure labels and their thresholds, "not measured" for unscored tasks,
  `level` not classified yet).
- Live proof: `node --experimental-strip-types scripts/genie-smoke.mjs`
  asked "How many postings landed in the last 7 days, and from which
  sources?" and got conversation `01f1b47399c7138ab81745ed9c5516bb`:
  Genie wrote
  `SELECT silver_roles.source, COUNT(*) ... WHERE created_at >= current_timestamp() - INTERVAL 7 DAYS GROUP BY source`,
  17 rows, scanner 5,995, feed:simplify 81, workday-tenant:pwc 27, and
  answered in prose.
- What the app calls it for: `lib/genie.ts` `askGenie(question)` (start
  conversation, poll to COMPLETED, fetch the SQL and the result rows; needs
  `DATABRICKS_GENIE_SPACE_ID`). No UI surface calls it yet; on stage, open
  the space in the workspace and ask a sample question.
- `role_archetypes` holds 7,590 rows and `role_tasks` 1,463 (2026-09-20). `level` is null for every posting (no classifier).
- Kit doc: `databricks-genie-agents` references/create-genie-agent.md
  (`create-space` with `warehouse_id`, `parent_path`, `serialized_space`) and
  references/serialized-space.md (version 2, 32-hex ids, array-valued text
  fields, id-sorted arrays, one `text_instructions` item);
  references/query-genie-agent.md (Conversation API states).

## Screen 7: Secret scope `scout`

- Object: secret scope `scout` with keys `lakebase_url`, `watcher_secret`,
  `gemini_api_key` (names listed via `GET /api/2.0/secrets/list?scope=scout`;
  values never printed). Both jobs read it with
  `dbutils.secrets.get(scope="scout", key=...)` and fail by name
  (`SYNC_SECRET_MISSING`, `ORCHESTRATOR_SECRETS`) when a key is missing.
- Kit doc: none covers secrets; the pattern follows
  https://docs.databricks.com/aws/en/security/secrets/ as the sync lane did.

## Not built

- No distilled classifier, no MLflow experiment or holdout table, no Model
  Serving endpoint (`level` is null across `silver_roles`).
- No managed MCP server on Databricks; the app's own MCP route
  (`app/api/[transport]/route.ts`) is the only agent surface.
- No gold tables.
- Drop latency is not "within 1 hour": the 17:40 ET measurement (n=1,800)
  was backlog-dominated (p50 about 46 h).

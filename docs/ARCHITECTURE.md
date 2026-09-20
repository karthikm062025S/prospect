# Prospect — technical brief for judges (VTHacks 14, Deloitte x Databricks "Campus career navigator")

Written 2026-09-19 evening from the live system, not from plans. Every number below was read from the running services at the time stated; re-read before quoting on stage.

## One paragraph

Prospect is the career journey for every Virginia Tech student, all majors. A student uploads a resume and an unofficial transcript, picks role types, a target term, a one-sentence goal and a dream tier. Four Gemini agents (Profile, Match, Roadmap, Orchestrator) turn that into two things on one screen: the live opportunity feed ranked best-to-least for that student, and a semester roadmap of real VT courses, clubs, projects and certifications. Every posting is broken into tasks and labeled from published exposure data (Human Edge: which tasks stay human-led, which are AI-assisted, which are automatable), with "not measured" shown wherever data is missing. Databricks is the data and ranking backend: Lakebase holds every application table, an hourly Job mirrors it into Delta (bronze and silver), and a Vector Search-backed archetype registry ranks every student against real postings.

## Stack, one line each

| Layer | What | Why this choice |
| --- | --- | --- |
| Web app | Next 16 App Router, TypeScript, React server components, deployed on Vercel at prospect.courses | one codebase for UI, server actions and API routes; streaming NDJSON for agent progress |
| Auth | Supabase Auth, email + password only (Google removed) | the login and nothing else; zero tables, zero storage, service-role key unused |
| Database | Databricks Lakebase (managed Postgres 16) via `pg`, role `scout_app`, 22 tables | the only application data store; every per-user query carries `where user_id = $1`, enforced by a grep-based test that derives the table list from the schema files |
| Analytics store | Databricks Delta, Unity Catalog `scout.core` | bronze/silver mirror of roles, companies, applications; O*NET tasks, task exposure, archetypes, VT catalog |
| Retrieval | Databricks Vector Search endpoint `scout-vs` | `archetypes_index` (93 archetypes, ready), `onet_tasks_index` (18,838 tasks, online), `vt_courses_index` (5,956 courses, online), `vt_clubs_index` (765 clubs, online) |
| Jobs | Databricks Jobs, serverless, secret scope `scout` | `scout-sync-lakebase-to-delta` hourly (job 473951197133128); Orchestrator job (see status) |
| LLM | Gemini via `@google/genai`: `gemini-3.8-flash` for the four agents and for PDF parsing (D-UI11; pro re-compare pending a real PDF), `gemini-3.1-flash-lite` reserved for labelling | prepaid key; every call uses a JSON response schema and job text is fenced as data, never instructions |
| Ingestion | GitHub Actions crons: `scan.yml` every 30 min (about 1,000 public ATS boards + 12 Workday tenants), `read-feeds.yml` hourly, `heartbeat.yml` hot tier, `gate-sweep.yml` every 3 h | free, auditable, posts to `/api/watcher` with a shared secret |
| Datasets | O*NET task statements (18,838), Anthropic Economic Index task exposure (2,450 tasks = 13% coverage), catalog.vt.edu 2026-27 (5,956 courses across 142 departments, 214 majors, 4,830 checksheet rows) | all loaded into Delta with sources cited in `datasets/SOURCES.md`; 765 clubs from GobblerConnect public listings |

## Data flow (what happens when)

1. **Drops arrive.** A cron run scans boards, batches postings (150 per POST) to `/api/watcher`. The watcher validates each payload, dedupes on company + canonical key, inserts or updates `roles` in Lakebase, captures the job description. Proven live: one wide scan inserted 2,269 and updated 3,779 rows with 0 errors; the feed reader inserted 95. Lakebase held 7,590 roles at 16:55 ET.
2. **Hourly mirror.** The Databricks sync Job reads Lakebase with `pg8000` (the psycopg2 C extension crashes the serverless kernel) and writes `bronze_*` (full snapshot) then MERGEs into `silver_*`. Two run-now proofs and periodic runs succeed; bronze = silver = the Lakebase count at sync time.
3. **Onboarding.** `/setup` posts the PDFs and facts to `/api/profile`. The Profile agent parses both PDFs with Gemini into a structured `profiles` row (major, grad term, work authorization, skills, courses, goal, dream tier). Progress streams as named steps with real counts.
4. **Match.** `/api/match` runs seven named steps per profile: embed the goal + resume, retrieve the nearest archetypes from Vector Search, confirm with Gemini, score each open posting (pure function, weights 0.5 archetype fit / 0.3 level fit / 0.1 dream-tier fit / 0.1 recency), derive requirements met vs unknown in code, write `match_scores`, emit `new_drop` nudges. Home sorts by best match when scores exist.
5. **Labels.** For each posting, Gemini extracts duties, each duty retrieves its nearest O*NET task from `onet_tasks_index`, the task joins to exposure data. Output: Human-led / AI-assisted / Automatable counts, or "not measured" when the task has no exposure row (87% of tasks) or the posting has no mapping yet.
6. **Roadmap.** The Roadmap agent loads candidate courses (and clubs when the club catalog is loaded) from Delta through the SQL warehouse by keyword, finds certifications by grounded web search with the source linked, plans semesters with Gemini, then validates every course code and club name against the catalog. Invented nodes are rejected. Nodes are editable; the agent re-plans later semesters.
7. **Orchestrator.** A Databricks Job that counts new drops since its last run and calls the app's `/api/match?all=1` with the watcher secret so ranking has one implementation (TypeScript), never a Python copy. Status below.

## What is real, what is pending (as of the time in the header)

| Piece | Status | Proof |
| --- | --- | --- |
| Lakebase as the only app database | real | 22 tables live, schema files 001-006 byte-identical to the live catalog |
| 30-minute ingestion | real | Actions run ids in the repo's Actions tab; 7,590 roles and growing |
| Bronze/silver Delta mirror | real | job 473951197133128, hourly, success runs |
| Gold tables | not built | say bronze/silver only |
| Archetype registry + Vector Search | real | 93 archetypes, `archetypes_index` ready and queried by Match |
| O*NET task labels | real | `onet_tasks_index` online with all 18,838 rows |
| VT course catalog | real | 5,956 courses in Delta, read by SQL for the roadmap |
| VT clubs | real | 765 clubs in Lakebase and Delta, read by the roadmap |
| Profile / Match / Roadmap agents | real | streamed named steps; one real profile run recorded on the demo accounts |
| Orchestrator Job | see DEMO.md | built tonight; run id recorded there |
| Genie "why" tool | see DEMO.md | space is UI-created on Free Edition; conversation API wired if the space exists |
| Distilled classifier + MLflow holdout | not built | do not claim |
| Model Serving | not built | do not claim |
| Databricks managed MCP | not built | the app has its own MCP server (`/api/[transport]`, bearer secret); that is not Databricks managed MCP |
| ANS agent passport (GoDaddy) | registered and deployed | Profile, Match, Roadmap and Orchestrator hold ANS (Agent Name Service) identities under `prospect.courses`, ACTIVE on the Transparency Log (TL) after the Registration Authority (RA) we run from the ANS reference stack verified them; `startAgentRun` refuses a write from any non-ACTIVE agent; a judge's Claude discovers, verifies and calls our Model Context Protocol (MCP) server (bearer-scoped `whoami`/`plan_next_steps`) over 16 live DNS rows (A, SVCB service-binding, TXT badge, TLSA cert-pinning) across the four agent sub-hosts; deployed head 0a4af41 |

## Harness rules a judge may ask about

- No mock data anywhere: fixtures are real files or real rows; the shipped demo persona is a synthetic mock.
- Failures are loud and named: every missing env, unreachable service, failed model call, empty index or rejected row surfaces with the name of the thing that failed (`DB_QUERY_FAILED (roles): ...`, `ONET_INDEX_NOT_READY`, `AUTH_UNAVAILABLE`, `Club catalog not loaded: expected datasets/vt_clubs.csv ...`).
- Job text is data: every prompt that sees posting or PDF text fences it and validates the model's JSON against a schema before anything is written.
- Secrets: watcher secret compared timing-safe; MCP bearer secret; Databricks PAT scoped to this weekend and revoked after; nothing hardcoded (verified by review).
- Drop latency is a measured claim, never a target: the script prints n / p50 / p95 / share under 60 minutes from the last 24 h. Tonight's reading is backlog-dominated (first wide scans ingested days-old postings). Do not say "within 1 hour" until the re-measure on postings published after the cadence began says so.

## Q&A bank (short answers)

1. **Why Databricks and not just Postgres?** Lakebase is Postgres, managed inside Databricks, so the app gets a transactional store and the same data lands in Delta for Vector Search, Jobs and (next) Genie without an ETL vendor. One platform, one catalog, one secret scope.
2. **What does Vector Search do here?** Two things today: it maps a student's goal and a posting's title to the nearest named archetype (open vocabulary, 90 definitions written from real titles), and it maps each extracted duty to its nearest O*NET task so exposure data can label it.
3. **How do you avoid hallucinated courses?** The roadmap can only place nodes whose course code or club name exists in the catalog tables; the validator rejects the rest. Certifications must come with a source link from grounded search.
4. **Where do the Human Edge labels come from?** Published task-level exposure data joined on O*NET task ids. Coverage is 2,450 of 18,838 tasks (13%); everything else says "not measured". We never guess a label.
5. **Is the ranking a black box?** No. The score is a pure function with fixed weights; the card shows the reasons, the requirements met vs unknown, and the archetype it matched.
6. **What runs on a schedule?** GitHub Actions every 30 minutes for ingestion; Databricks Jobs hourly for the Delta mirror and the Orchestrator.
7. **What is Supabase doing?** Only the login. No tables, no storage, no service-role key in use.
8. **How would this scale?** Ingestion is already batched and idempotent; Lakebase and serverless Jobs scale independently; the classifier (Gemini labels once, a small model trains on Databricks, evaluated on a human-labeled holdout) is specified and not built. Model Serving would host it.
9. **Deployment roadmap?** Week 1: clubs catalog, Genie in-app, classifier holdout. Month 1: managed MCP so any student's own agent can call Prospect. Term 1: department pilots with advisors editing roadmaps.
10. **What did you not build?** Gold tables, the classifier, Model Serving, managed MCP. Each is listed above with why. ANS is registered and deployed but the Transparency Log is local, not public; real-domain `dns.type: lookup` re-verification (today's identities use the noop DNS profile) and an in-app gate on the Orchestrator job itself (it calls `/api/match` directly, ungated) are both still open.


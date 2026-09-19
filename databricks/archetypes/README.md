# Archetype registry + Vector Search indexes (L2b)

Order:
1. `psql "$LAKEBASE_URL" -f db/lakebase/005-archetypes.sql` -- creates `archetypes`, `role_archetypes`, `role_tasks` in Lakebase.
2. `node scripts/load-datasets.mjs --dir datasets` -- lands `vt_courses`, `vt_clubs`, `onet_tasks`, `task_exposure` into `scout.core.*` Delta tables (L3's script; a prerequisite here, not owned by this lane).
3. `node scripts/create-vs-indexes.mjs` -- enables Change Data Feed on each `scout.core.*` source table, creates the four Delta-sync indexes on the one `scout-vs` endpoint (`archetypes_index`, `onet_tasks_index`, `vt_courses_index`, `vt_clubs_index`), and polls each to ready. Skips and reports `exists <name>` when an index is already there.
4. `node scripts/seed-archetypes.mjs` -- reads distinct open-posting titles from Lakebase `roles`, asks Gemini for named archetypes covering them (never padded to a target count), writes them to Lakebase `archetypes` (status `confirmed`, printed for review) and mirrors them to `scout.core.archetypes`, then re-syncs `archetypes_index`.

Checks:
- `node scripts/create-vs-indexes.mjs` and `node scripts/seed-archetypes.mjs` each exit 1 naming the first missing env var when required env (`DATABRICKS_HOST`, `DATABRICKS_TOKEN`, `DATABRICKS_VS_ENDPOINT`, `LAKEBASE_URL`, `GEMINI_API_KEY`) is unset.
- `select name, status from archetypes order by name;` in Lakebase should show only `confirmed` rows after step 4 (a later posting's `assignArchetype` call is the only thing that ever writes `provisional`).
- `lib/archetypes.ts`'s `assignArchetype` and `lib/posting-tasks.ts`'s `mapPostingTasks` need steps 1-4 done once; after that they run per posting.

Free Edition caveats (RUNBOOK-databricks.md §4/§8): exactly one Vector Search endpoint and one search unit for the whole account -- `scout-vs` is it, never create a second; the only hosted embedding model is `databricks-gte-large-en`; a Delta-sync index needs Change Data Feed enabled on its source table (step 3 does this); index creation is async (`TRIGGERED` pipeline) so `create-vs-indexes.mjs` polls status until `ready` instead of assuming it finished.

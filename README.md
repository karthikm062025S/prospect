# Scout — VTHacks 14 (2026-09-18 → 20)

A career agent a Virginia Tech student talks to like a person: it finds today's openings, proves each one is real and that the student is eligible, refuses any agent that cannot prove who it is, and acts only through one evidence-bound approval gate.

Provenance: the UI foundation comes from our own earlier open project (Scout); this repository starts from a fresh history and everything in it was built during VTHacks 14. Sponsors integrated: Databricks (Lakebase, Delta, Vector Search, Model Serving, Genie, managed MCP), GoDaddy Agent Name Service (verified agent identity), Cloudforce HokieAI (zero-login sidekick), Gemini API.

Database: every app table lives in Databricks Lakebase (managed Postgres 17) behind one `pg` pool (`lib/db.ts`, env `LAKEBASE_URL`); Supabase is auth only. Apply the schema with `psql "$LAKEBASE_URL" -f db/lakebase/001-schema.sql` (idempotent; `node --env-file=.env.local scripts/db-smoke.mjs` applies it and prints per-table counts), then seed the real 2026-09-04 export with `node --env-file=.env.local scripts/import-baseline.mjs` (needs the gitignored `db/baseline-2026-09/*.json`; idempotent, prints inserted/skipped per table). Tests run the same schema in-process with pglite (`tests/helpers/test-db.ts`).

Known limits, stated plainly: see `docs/KNOWN-LIMITS.md` (written before judging).

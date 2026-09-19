# Migration log: `migration-2026-09-v5.sql`

- Date written: 2026-08-24 (v5 build session)
- Applied: _pending_ — Karthik pastes `db/APPLY-2026-08-24.sql` (temp-function drop + this file + the fast-lane migration + verification) in the Supabase SQL editor. The orchestrator's paste attempts were blocked by the permission classifier (house rule: a denial is intent).
- Why it gates the deploy (Fable audit B1): `lib/upsert-role.ts` writes `roles.location` on every insert/update, so ingest fails per-row until the column exists; Home selects `saved_at/hidden_at/location` and 500s. **Push master only after this is applied.**

## Adds (all additive, idempotent)
- `roles.location text`, `roles.saved_at timestamptz`, `roles.hidden_at timestamptz`, `roles.jd_snapshot text`, `roles.jd_snapshot_at timestamptz`, `roles.jd_error text`
- index `roles_saved_idx (saved_at desc) where saved_at is not null`

## Verification (in APPLY-2026-08-24.sql's final select): `v5cols = 6`

- **APPLIED 2026-08-25 13:50Z** via `db/APPLY-2026-08-24.sql` (Supabase SQL editor). Verification: vault=1, tmpfn=0, v5cols=6, watch_state_rls=true, dedup_idx=1, ext=pg_cron,pg_net, cron scout-fast-hot `*/30` active=true.

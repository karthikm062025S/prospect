# migration-2026-09-task3-signals.sql

Additive: 4 columns on `roles` (`last_seen_at`, `repost_count`, `canonical_key`, `gate_checked_at`), 2 partial indexes, table `role_corrections` + 4 owner-only policies, `roles_public` re-created with the 4 columns appended. Depends on `migration-2026-09-task2-classify.sql` being applied first.

APPLIED: not yet (2026-09-16). Karthik pastes; see `planning/task-3-karthik-steps.md`.

Baseline before apply (read-only, 2026-09-16): roles 2,313 total; open rows with a JD 1,502; rows with a non-null `visa_class` 5.

Verify after apply: the four queries at the bottom of the .sql file; expected 4 rows / view ends with the 4 new columns / 0 null last_seen_at / 4 policies. RLS proof (orchestrator, read-only except one disposable `role_corrections` fixture): owner 1, other user 0, anon 0, residue 0.

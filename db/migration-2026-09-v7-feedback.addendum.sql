-- Addendum to db/migration-2026-09-v7-public.sql: adds the anon/user daily
-- rate-limit column to public.feedback. Idempotent — safe to re-run.
alter table public.feedback add column if not exists ip_hash text;
create index if not exists feedback_ip_day_idx on public.feedback (ip_hash, created_at desc);

-- G1 (2026-09-03) H1: anon can INSERT through PostgREST directly, so the
-- app's zod caps are not the boundary; the table is. Generous backstops.
alter table public.feedback drop constraint if exists feedback_field_lengths;
alter table public.feedback add constraint feedback_field_lengths check (
  char_length(coalesce(page, '')) <= 300
  and char_length(coalesce(email, '')) <= 320
  and char_length(coalesce(user_agent, '')) <= 512
  and char_length(coalesce(ip_hash, '')) <= 128
);

-- SR-001 (security review 2026-09-03) High: revoke the anon/authenticated
-- INSERT grant. The public anon key is in the browser bundle, so this policy
-- let anyone POST /rest/v1/feedback in a loop and trip the 200/day global cap
-- (feature DoS) or fill the Free-tier 500 MB. Writes now go through the
-- service role in lib/feedback-server.ts, AFTER the per-user/IP and global
-- caps. RLS stays enabled; feedback_select_own is untouched. Idempotent.
drop policy if exists feedback_insert_own on public.feedback;

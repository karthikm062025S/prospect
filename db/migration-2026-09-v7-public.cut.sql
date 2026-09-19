-- v7 PASTE 2 — run ONLY after the deploy that no longer reads these (L2 merged + deployed).
-- Baseline: drops/tasks/prep_items are empty; application_events columns unused since the Gmail lane was cut.
-- D-CUT (run after the app deploy that stops reading these)
-- Paste 2: run this section separately after that deploy; keep this order.
drop table if exists public.drops;
drop table if exists public.tasks;
drop table if exists public.prep_items;
drop table if exists public.email_rules;
alter table public.application_events
  drop column if exists gmail_msgid,
  drop column if exists suggested_status,
  drop column if exists confidence,
  drop column if exists auto_applied,
  drop column if exists prev_status;

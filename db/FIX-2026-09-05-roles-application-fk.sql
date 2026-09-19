-- Karthik runs this in the Supabase SQL editor (prod DB op). Prepared 2026-09-05.
-- Why: deleting an application failed with 23503 "roles_application_id_fkey":
-- the legacy single-user column roles.application_id has a plain FK with no
-- ON DELETE rule. app/actions.ts now clears the pointer before deleting; this
-- makes the schema do it so the app-side workaround can be removed.
alter table public.roles drop constraint if exists roles_application_id_fkey;
alter table public.roles
  add constraint roles_application_id_fkey
  foreign key (application_id) references public.applications(id) on delete set null;

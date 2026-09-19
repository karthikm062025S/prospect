select count(*) as user_roles_count from public.user_roles;

select count(*) as applications_null_user_id_count
from public.applications
where user_id is null;

select count(*) as outreach_null_user_id_count
from public.outreach
where user_id is null;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'roles',
    'companies',
    'user_roles',
    'applications',
    'outreach',
    'application_events',
    'feedback'
  )
order by tablename, policyname;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'roles'
  and column_name in ('season', 'family')
order by column_name;

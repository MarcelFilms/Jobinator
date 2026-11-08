-- Allow the public sources added for a wider search, and hold automatic sending off.
-- Run this in the Supabase SQL editor if it has not been applied yet.

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'jobs'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%source%'
  loop
    execute format('alter table public.jobs drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.jobs add constraint jobs_source_check
  check (source in (
    'weworkremotely',
    'jobicy',
    'reed',
    'workingnomads',
    'remotive',
    'greenhouse',
    'lever',
    'ashby'
  ));

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'source_runs'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%source%'
  loop
    execute format('alter table public.source_runs drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.source_runs add constraint source_runs_source_check
  check (source in (
    'weworkremotely',
    'jobicy',
    'reed',
    'workingnomads',
    'remotive',
    'greenhouse',
    'lever',
    'ashby'
  ));

alter table public.settings add column if not exists auto_send_enabled boolean not null default false;

alter table public.settings alter column daily_application_limit set default 15;

update public.settings
set daily_application_limit = 15
where daily_application_limit = 5;

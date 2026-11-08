-- Allow UK board sources. Safe to run after 0003, and also safe if 0003 was never applied.

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
    'weworkremotely', 'jobicy', 'reed',
    'workingnomads', 'remotive', 'greenhouse', 'lever', 'ashby',
    'indeed', 'cvlibrary', 'totaljobs', 'linkedin', 'adzuna', 'glassdoor',
    'arbeitnow', 'remoteok'
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
    'weworkremotely', 'jobicy', 'reed',
    'workingnomads', 'remotive', 'greenhouse', 'lever', 'ashby',
    'indeed', 'cvlibrary', 'totaljobs', 'linkedin', 'adzuna', 'glassdoor',
    'arbeitnow', 'remoteok'
  ));

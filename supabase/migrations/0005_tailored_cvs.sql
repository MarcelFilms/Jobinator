-- A tailored CV per application, built from the approved base CV and profile facts,
-- checked by the deterministic validator, and rendered to a PDF in the private cvs bucket.
-- Run this in the Supabase SQL editor.

create table if not exists public.tailored_cvs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  base_cv_id uuid references public.cvs (id) on delete set null,
  label text not null,
  method text not null check (method in ('rules', 'model')),
  model text,
  content jsonb not null,
  plain_text text not null,
  text_hash text not null,
  storage_path text,
  passed boolean not null,
  findings jsonb not null default '[]'::jsonb,
  omitted jsonb not null default '[]'::jsonb,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tailored_cvs_job_idx on public.tailored_cvs (job_id);

alter table public.tailored_cvs enable row level security;

revoke all on table public.tailored_cvs from anon, authenticated;
grant all on table public.tailored_cvs to service_role;
grant select on table public.tailored_cvs to authenticated;

drop policy if exists tailored_cvs_owner_select on public.tailored_cvs;
create policy tailored_cvs_owner_select on public.tailored_cvs
  for select to authenticated using (public.is_owner());

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'ai_usage'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%task%'
  loop
    execute format('alter table public.ai_usage drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.ai_usage add constraint ai_usage_task_check
  check (task in ('discover', 'rescore', 'personalize', 'validate', 'tailor_cv'));

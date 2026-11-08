-- Evidence for Greenhouse, Lever, and Ashby submissions.
-- A row is outcome 'sent' only after the board's response confirms the application.
-- Also stores an optional phone the owner can put on forms. Nothing here is invented.

alter table public.candidate_profiles
  add column if not exists phone text;

create table if not exists public.application_submissions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  source text not null,
  outcome text not null check (outcome in ('sent', 'skipped', 'rejected')),
  http_status integer,
  response jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists application_submissions_one_sent
  on public.application_submissions (job_id)
  where outcome = 'sent';

create index if not exists application_submissions_job_idx
  on public.application_submissions (job_id, created_at desc);

alter table public.application_submissions enable row level security;

revoke all on table public.application_submissions from anon, authenticated;
grant all on table public.application_submissions to service_role;
grant select on table public.application_submissions to authenticated;

drop policy if exists application_submissions_owner_select on public.application_submissions;
create policy application_submissions_owner_select on public.application_submissions
  for select to authenticated using (public.is_owner());

-- Milestone 1 schema for the private job-application assistant.
-- Money for AI is GBP. Job salaries keep the currency the source sent.
-- No town, county, or LinkedIn columns.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('weworkremotely', 'jobicy', 'reed')),
  external_id text not null,
  canonical_url text not null,
  company_name text not null default '',
  title text not null,
  description_html text not null default '',
  description_text text not null default '',
  location_text text not null default '',
  remote_signal text not null check (remote_signal in ('board_remote', 'explicit_remote', 'onsite', 'unknown')),
  uk_eligibility text not null check (uk_eligibility in ('explicit_uk', 'worldwide', 'rejected', 'unknown')),
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  salary_period text,
  salary_text text,
  salary_is_advertised boolean not null default false,
  employment_type text,
  application_url text,
  application_email text,
  published_at timestamptz,
  expires_at timestamptz,
  content_hash text not null,
  duplicate_of uuid references public.jobs (id) on delete set null,
  status text not null check (status in ('discovered', 'filtered_out', 'shortlisted', 'expired', 'duplicate')),
  filter_reason text,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source, external_id),
  unique (source, canonical_url)
);

create index if not exists jobs_content_hash_idx on public.jobs (content_hash);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_duplicate_of_idx on public.jobs (duplicate_of);
create index if not exists jobs_first_seen_idx on public.jobs (first_seen_at desc);

-- ---------------------------------------------------------------------------
-- candidate_profiles
-- ---------------------------------------------------------------------------

create table if not exists public.candidate_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  contact_email text not null default '',
  facts jsonb not null default '[]'::jsonb,
  years_customer_facing numeric,
  languages text[] not null default array['English'],
  target_categories text[] not null default array[
    'customer support',
    'chat/ticket support',
    'SaaS support',
    'customer success'
  ],
  qualifications_absent text[] not null default array[
    'a university degree',
    'professional software-engineering experience',
    'languages other than English'
  ],
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- writing_rules
-- ---------------------------------------------------------------------------

create table if not exists public.writing_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rule_key text not null,
  instruction text not null,
  severity text not null check (severity in ('block', 'rewrite')),
  applies_to text not null check (applies_to in ('employer_text', 'internal_only')),
  unique (user_id, rule_key)
);

-- ---------------------------------------------------------------------------
-- cvs (milestone 2; schema fixed now)
-- ---------------------------------------------------------------------------

create table if not exists public.cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (label in ('customer_support', 'saas_product_support', 'digital_marketing', 'general')),
  storage_path text not null,
  plain_text text not null default '',
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, label)
);

-- ---------------------------------------------------------------------------
-- job_scores
-- ---------------------------------------------------------------------------

create table if not exists public.job_scores (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  content_hash text not null,
  fit_score integer,
  fit_status text not null check (fit_status in ('scored', 'unknown')),
  fit_reasons jsonb not null default '[]'::jsonb,
  oe_score numeric,
  oe_status text not null check (oe_status in ('scored', 'unknown')),
  oe_confidence text check (oe_confidence in ('low', 'normal')),
  oe_reasons jsonb not null default '[]'::jsonb,
  scorer text not null default 'rules_v1',
  model text,
  created_at timestamptz not null default now(),
  check (fit_score is null or (fit_score >= 0 and fit_score <= 100)),
  check (oe_score is null or (oe_score >= 0 and oe_score <= 10)),
  check (
    (fit_status = 'unknown' and fit_score is null)
    or (fit_status = 'scored' and fit_score is not null)
  ),
  check (
    (oe_status = 'unknown' and oe_score is null and oe_confidence is null)
    or (oe_status = 'scored' and oe_score is not null and oe_confidence is not null)
  )
);

-- ---------------------------------------------------------------------------
-- applications (milestone 2 onward)
-- No OE columns. Employer-facing subject and body only.
-- ---------------------------------------------------------------------------

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  cv_id uuid references public.cvs (id) on delete set null,
  kind text not null check (kind in ('template', 'personalized')),
  status text not null check (status in (
    'drafted',
    'needs_review',
    'approved',
    'rejected',
    'sent',
    'replied',
    'interview',
    'rejected_by_employer',
    'offer'
  )),
  subject text not null default '',
  body text not null default '',
  recipient_email text,
  gmail_draft_id text,
  gmail_message_id text,
  sent_at timestamptz,
  owner_edited boolean not null default false
);

-- ---------------------------------------------------------------------------
-- validation_results
-- ---------------------------------------------------------------------------

create table if not exists public.validation_results (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  body_hash text not null,
  passed boolean not null,
  method text not null check (method in ('deterministic', 'model')),
  findings jsonb not null default '[]'::jsonb,
  requires_manual_review boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists validation_results_application_idx
  on public.validation_results (application_id, created_at desc);

-- ---------------------------------------------------------------------------
-- ai_usage and ai_daily
-- ---------------------------------------------------------------------------

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  day date not null,
  task text not null check (task in ('discover', 'rescore', 'personalize', 'validate')),
  job_id uuid references public.jobs (id) on delete set null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_gbp numeric not null default 0,
  cache_hit boolean not null default false,
  outcome text not null check (outcome in (
    'no_model',
    'cache_hit',
    'called',
    'blocked_disabled',
    'blocked_cap'
  ))
);

create index if not exists ai_usage_day_idx on public.ai_usage (day);

create table if not exists public.ai_daily (
  day date primary key,
  jobs_seen integer not null default 0,
  jobs_rejected_without_model integer not null default 0,
  jobs_scored_without_model integer not null default 0,
  jobs_unknown_without_model integer not null default 0,
  model_calls integer not null default 0,
  cache_hits integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  spend_gbp numeric not null default 0,
  paused boolean not null default false
);

-- ---------------------------------------------------------------------------
-- ai_cache (milestone 1 never reads this)
-- ---------------------------------------------------------------------------

create table if not exists public.ai_cache (
  content_hash text not null,
  task text not null,
  model text not null,
  prompt_version text not null,
  profile_revision timestamptz not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (content_hash, task, model, prompt_version, profile_revision)
);

-- ---------------------------------------------------------------------------
-- settings
-- category_blocklist is the editable stage-1 block list.
-- fit_bands stores the excellent / good / stretch edges.
-- A cap of 0 cannot enable a model.
-- ---------------------------------------------------------------------------

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  min_fit_score integer not null default 55,
  fit_bands jsonb not null default '{"excellent":85,"good":70,"stretch":55}'::jsonb,
  salary_min_gbp numeric,
  daily_application_limit integer not null default 5,
  require_approval boolean not null default true,
  ai_enabled boolean not null default false,
  daily_spend_cap_gbp numeric not null default 0,
  monthly_spend_cap_gbp numeric not null default 0,
  cheap_model text,
  strong_model text,
  provider_base_url text,
  model_prices jsonb not null default '{}'::jsonb,
  allow_strong_model boolean not null default false,
  category_blocklist text[] not null default array[
    'clinical',
    'nurse',
    'nursing',
    'physician',
    'doctor',
    'dental',
    'surgeon',
    'driving',
    'driver',
    'hgv',
    'warehouse',
    'picker',
    'forklift',
    'chef',
    'cook',
    'barista',
    'solicitor',
    'barrister',
    'plumber',
    'electrician'
  ],
  check (
    ai_enabled = false
    or (daily_spend_cap_gbp > 0 and monthly_spend_cap_gbp > 0)
  )
);

-- ---------------------------------------------------------------------------
-- source_runs
-- next_cursor resumes a Jobicy page. The cursor is only valid for 24 hours
-- and only with the same filters.
-- ---------------------------------------------------------------------------

create table if not exists public.source_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('weworkremotely', 'jobicy', 'reed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean not null default false,
  http_status integer,
  jobs_fetched integer not null default 0,
  jobs_inserted integer not null default 0,
  jobs_filtered integer not null default 0,
  error text,
  next_cursor text
);

create index if not exists source_runs_source_finished_idx
  on public.source_runs (source, finished_at desc);

-- ---------------------------------------------------------------------------
-- gmail_credentials (milestone 3). No client select policy.
-- ---------------------------------------------------------------------------

create table if not exists public.gmail_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_encrypted text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Owner seed. Called with the auth user id after the allowlisted owner exists.
-- Does not overwrite facts the owner has already edited.
-- ---------------------------------------------------------------------------

create or replace function public.seed_owner(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.candidate_profiles (
    user_id,
    display_name,
    contact_email,
    facts,
    years_customer_facing,
    languages,
    target_categories,
    qualifications_absent
  ) values (
    p_user_id,
    '',
    coalesce(p_email, ''),
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'skill',
        'text', 'Customer support and customer-facing experience.',
        'organisation', null,
        'start', null,
        'end', null
      ),
      jsonb_build_object(
        'kind', 'employment',
        'text', 'Running Arbonomics, a subscription-based software business, including customer enquiries, troubleshooting and subscription support.',
        'organisation', 'Arbonomics',
        'start', null,
        'end', null
      ),
      jsonb_build_object(
        'kind', 'skill',
        'text', 'Professional digital marketing experience.',
        'organisation', null,
        'start', null,
        'end', null
      ),
      jsonb_build_object(
        'kind', 'employment',
        'text', 'Customer-facing management experience.',
        'organisation', null,
        'start', null,
        'end', null
      ),
      jsonb_build_object(
        'kind', 'skill',
        'text', 'Building websites, booking systems and other business software.',
        'organisation', null,
        'start', null,
        'end', null
      ),
      jsonb_build_object(
        'kind', 'skill',
        'text', 'Excellent written English, communication and problem-solving skills.',
        'organisation', null,
        'start', null,
        'end', null
      )
    ),
    null,
    array['English'],
    array['customer support', 'chat/ticket support', 'SaaS support', 'customer success'],
    array[
      'a university degree',
      'professional software-engineering experience',
      'languages other than English'
    ]
  )
  on conflict (user_id) do nothing;

  insert into public.writing_rules (user_id, rule_key, instruction, severity, applies_to)
  values
    (p_user_id, 'no_invented_facts', 'Do not invent qualifications, achievements, experience, or dates.', 'block', 'employer_text'),
    (p_user_id, 'no_user_counts_or_telegram', 'Do not mention Arbonomics user counts or Telegram.', 'block', 'employer_text'),
    (p_user_id, 'no_ai_tools', 'Do not mention AI-assisted development tools.', 'block', 'employer_text'),
    (p_user_id, 'no_town_county_linkedin', 'Do not include town, county, or LinkedIn.', 'block', 'employer_text'),
    (p_user_id, 'call_it_arbonomics', 'Call the software business Arbonomics.', 'block', 'employer_text'),
    (p_user_id, 'no_overemployment', 'Do not mention overemployment, OE, a second job, or the OE score.', 'block', 'employer_text'),
    (p_user_id, 'tone', 'Tone stays natural, professional, friendly, and confident.', 'block', 'employer_text')
  on conflict (user_id, rule_key) do nothing;

  insert into public.settings (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.seed_owner(uuid, text) from public, anon, authenticated;
grant execute on function public.seed_owner(uuid, text) to service_role;

-- True when the signed-in user has the single owner profile.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.candidate_profiles
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.writing_rules enable row level security;
alter table public.cvs enable row level security;
alter table public.job_scores enable row level security;
alter table public.applications enable row level security;
alter table public.validation_results enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_daily enable row level security;
alter table public.ai_cache enable row level security;
alter table public.settings enable row level security;
alter table public.source_runs enable row level security;
alter table public.gmail_credentials enable row level security;

revoke all on table
  public.jobs,
  public.candidate_profiles,
  public.writing_rules,
  public.cvs,
  public.job_scores,
  public.applications,
  public.validation_results,
  public.ai_usage,
  public.ai_daily,
  public.ai_cache,
  public.settings,
  public.source_runs,
  public.gmail_credentials
from anon, authenticated;

grant all on table
  public.jobs,
  public.candidate_profiles,
  public.writing_rules,
  public.cvs,
  public.job_scores,
  public.applications,
  public.validation_results,
  public.ai_usage,
  public.ai_daily,
  public.ai_cache,
  public.settings,
  public.source_runs,
  public.gmail_credentials
to service_role;

grant select on table
  public.jobs,
  public.job_scores,
  public.applications,
  public.validation_results,
  public.ai_usage,
  public.ai_daily,
  public.source_runs,
  public.cvs
to authenticated;

grant select, update on table public.candidate_profiles to authenticated;
grant select, update on table public.writing_rules to authenticated;
grant select, update on table public.settings to authenticated;

drop policy if exists jobs_owner_select on public.jobs;
create policy jobs_owner_select on public.jobs
  for select to authenticated using (public.is_owner());

drop policy if exists scores_owner_select on public.job_scores;
create policy scores_owner_select on public.job_scores
  for select to authenticated using (public.is_owner());

drop policy if exists applications_owner_select on public.applications;
create policy applications_owner_select on public.applications
  for select to authenticated using (public.is_owner());

drop policy if exists validation_owner_select on public.validation_results;
create policy validation_owner_select on public.validation_results
  for select to authenticated using (public.is_owner());

drop policy if exists ai_usage_owner_select on public.ai_usage;
create policy ai_usage_owner_select on public.ai_usage
  for select to authenticated using (public.is_owner());

drop policy if exists ai_daily_owner_select on public.ai_daily;
create policy ai_daily_owner_select on public.ai_daily
  for select to authenticated using (public.is_owner());

drop policy if exists source_runs_owner_select on public.source_runs;
create policy source_runs_owner_select on public.source_runs
  for select to authenticated using (public.is_owner());

drop policy if exists cvs_owner_select on public.cvs;
create policy cvs_owner_select on public.cvs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists profile_owner_select on public.candidate_profiles;
create policy profile_owner_select on public.candidate_profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists profile_owner_update on public.candidate_profiles;
create policy profile_owner_update on public.candidate_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists rules_owner_select on public.writing_rules;
create policy rules_owner_select on public.writing_rules
  for select to authenticated using (user_id = auth.uid());

drop policy if exists rules_owner_update on public.writing_rules;
create policy rules_owner_update on public.writing_rules
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists settings_owner_select on public.settings;
create policy settings_owner_select on public.settings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists settings_owner_update on public.settings;
create policy settings_owner_update on public.settings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ai_cache and gmail_credentials have no authenticated policies.
-- The browser cannot select the refresh token or the model cache.

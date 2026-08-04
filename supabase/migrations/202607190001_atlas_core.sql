create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

do $$ begin
  create type data_sensitivity as enum ('public','internal','confidential','restricted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type publication_status as enum ('private_draft','internal_review','approved','published','withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_level as enum ('unverified','organization_source','program_source','institution_source','workflow_source','owner_confirmed','field_evidence');
exception when duplicate_object then null; end $$;

do $$ begin
  create type case_stage as enum ('identified','verified','diagnostic_candidate','owner_ready','locked_field_case','paused','rejected','merged');
exception when duplicate_object then null; end $$;

create table if not exists domains (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name citext not null unique,
  definition text,
  inclusion_rule text,
  exclusion_rule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists program_families (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name citext not null unique,
  definition text,
  common_capacity_questions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  parent_id uuid references organizations(id),
  name text not null,
  organization_type text,
  geography text,
  primary_domain_id uuid references domains(id),
  authority_summary text,
  official_url text,
  sensitivity data_sensitivity not null default 'internal',
  verification_level verification_level not null default 'unverified',
  publication_status publication_status not null default 'private_draft',
  last_reviewed_at timestamptz,
  source_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizations_parent_idx on organizations(parent_id);
create index if not exists organizations_name_trgm_idx on organizations using gin(name gin_trgm_ops);

create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  organization_id uuid not null references organizations(id),
  program_family_id uuid references program_families(id),
  primary_domain_id uuid references domains(id),
  name text not null,
  description text,
  current_status text,
  user_population text,
  administering_owner_text text,
  official_url text,
  sensitivity data_sensitivity not null default 'internal',
  verification_level verification_level not null default 'unverified',
  publication_status publication_status not null default 'private_draft',
  last_reviewed_at timestamptz,
  source_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name)
);

create index if not exists programs_org_idx on programs(organization_id);
create index if not exists programs_name_trgm_idx on programs using gin(name gin_trgm_ops);

create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  organization_id uuid not null references organizations(id),
  program_id uuid references programs(id),
  name text not null,
  trigger_text text,
  initiator_text text,
  receiving_unit_text text,
  completion_outcome text,
  sensitivity data_sensitivity not null default 'internal',
  verification_level verification_level not null default 'unverified',
  publication_status publication_status not null default 'private_draft',
  last_reviewed_at timestamptz,
  source_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  workflow_id uuid not null references workflows(id) on delete cascade,
  sequence_no numeric(10,2) not null,
  actor_text text,
  task_or_decision text not null,
  required_information text,
  handoff_to_text text,
  completion_outcome text,
  verification_level verification_level not null default 'unverified',
  source_record jsonb not null default '{}'::jsonb,
  unique(workflow_id,sequence_no)
);

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  organization_id uuid not null references organizations(id),
  program_id uuid references programs(id),
  workflow_id uuid references workflows(id),
  primary_domain_id uuid references domains(id),
  program_family_id uuid references program_families(id),
  title text not null,
  user_population text not null,
  intended_outcome text not null,
  capacity_hypotheses text,
  named_owner_text text,
  program_unit_text text,
  promotion_trigger text,
  notes text,
  stage case_stage not null default 'identified',
  verification_level verification_level not null default 'unverified',
  sensitivity data_sensitivity not null default 'internal',
  publication_status publication_status not null default 'private_draft',
  official_url text,
  last_reviewed_at timestamptz,
  source_record jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cases_org_idx on cases(organization_id);
create index if not exists cases_program_idx on cases(program_id);
create index if not exists cases_stage_idx on cases(stage);
create index if not exists cases_title_trgm_idx on cases using gin(title gin_trgm_ops);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text,
  publisher text,
  source_type text not null default 'official_web',
  authority_rank integer not null default 3 check(authority_rank between 1 and 5),
  sensitivity data_sensitivity not null default 'public',
  retrieved_at timestamptz,
  last_checked_at timestamptz,
  next_review_at timestamptz,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists verification_events (
  id uuid primary key default gen_random_uuid(),
  subject_table text not null,
  subject_id uuid not null,
  verification_level verification_level not null,
  reviewed_at timestamptz not null default now(),
  expires_at timestamptz,
  result text not null check(result in ('confirmed','changed','conflict','unable_to_verify')),
  notes text,
  source_ids uuid[] not null default '{}'
);

create table if not exists migration_batches (
  id uuid primary key default gen_random_uuid(),
  baseline_name text not null,
  baseline_sha256 text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'staging',
  summary jsonb not null default '{}'::jsonb
);

create table if not exists migration_row_log (
  id bigserial primary key,
  batch_id uuid not null references migration_batches(id) on delete cascade,
  source_sheet text not null,
  source_row integer not null,
  legacy_id text,
  target_table text,
  target_id uuid,
  disposition text not null check(disposition in ('imported','excluded','merged','held','error')),
  reason text,
  source_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(batch_id,source_sheet,source_row)
);

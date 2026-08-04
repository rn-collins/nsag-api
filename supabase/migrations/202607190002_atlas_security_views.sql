create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  access_role text not null default 'viewer'
    check(access_role in ('admin','editor','researcher','reviewer','viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function current_access_role()
returns text language sql stable security definer set search_path=public as $$
  select coalesce((select access_role from user_profiles where user_id=auth.uid()),'viewer')
$$;

create or replace function can_edit()
returns boolean language sql stable security definer set search_path=public as $$
  select current_access_role() in ('admin','editor','researcher')
$$;

create or replace function can_review()
returns boolean language sql stable security definer set search_path=public as $$
  select current_access_role() in ('admin','editor','reviewer')
$$;

alter table user_profiles enable row level security;
alter table domains enable row level security;
alter table program_families enable row level security;
alter table organizations enable row level security;
alter table programs enable row level security;
alter table workflows enable row level security;
alter table workflow_steps enable row level security;
alter table cases enable row level security;
alter table sources enable row level security;
alter table verification_events enable row level security;
alter table migration_batches enable row level security;
alter table migration_row_log enable row level security;

create policy "profile self read" on user_profiles for select to authenticated
  using(user_id=auth.uid() or current_access_role()='admin');
create policy "profile admin edit" on user_profiles for all to authenticated
  using(current_access_role()='admin') with check(current_access_role()='admin');

create policy "authenticated domain read" on domains for select to authenticated using(true);
create policy "domain edit" on domains for all to authenticated using(can_edit()) with check(can_edit());

create policy "authenticated family read" on program_families for select to authenticated using(true);
create policy "family edit" on program_families for all to authenticated using(can_edit()) with check(can_edit());

create policy "authenticated organization read" on organizations for select to authenticated using(true);
create policy "organization edit" on organizations for all to authenticated using(can_edit()) with check(can_edit());

create policy "authenticated program read" on programs for select to authenticated using(true);
create policy "program edit" on programs for all to authenticated using(can_edit()) with check(can_edit());

create policy "authenticated workflow read" on workflows for select to authenticated using(true);
create policy "workflow edit" on workflows for all to authenticated using(can_edit()) with check(can_edit());

create policy "authenticated step read" on workflow_steps for select to authenticated using(true);
create policy "step edit" on workflow_steps for all to authenticated using(can_edit()) with check(can_edit());

create policy "authenticated case read" on cases for select to authenticated using(true);
create policy "case edit" on cases for all to authenticated using(can_edit()) with check(can_edit());

create policy "authenticated source read" on sources for select to authenticated using(true);
create policy "source edit" on sources for all to authenticated using(can_edit()) with check(can_edit());

create policy "verification read" on verification_events for select to authenticated using(true);
create policy "verification create" on verification_events for insert to authenticated with check(can_review() or can_edit());

create policy "migration admin only" on migration_batches for all to authenticated
  using(current_access_role()='admin') with check(current_access_role()='admin');
create policy "migration log admin only" on migration_row_log for all to authenticated
  using(current_access_role()='admin') with check(current_access_role()='admin');

create or replace view public_case_atlas
with (security_invoker=true) as
select
  c.legacy_id as case_id,
  c.title,
  o.name as organization,
  d.name as domain,
  pf.name as program_family,
  c.user_population,
  c.intended_outcome,
  c.official_url,
  c.last_reviewed_at
from cases c
join organizations o on o.id=c.organization_id
left join domains d on d.id=c.primary_domain_id
left join program_families pf on pf.id=c.program_family_id
where c.publication_status='published'
  and c.sensitivity='public'
  and o.publication_status='published'
  and o.sensitivity='public';

create or replace view atlas_coverage_summary
with (security_invoker=true) as
select
  d.legacy_id as domain_id,
  d.name as domain,
  count(distinct o.id) as organizations,
  count(distinct p.id) as programs,
  count(distinct c.id) as cases,
  count(distinct c.id) filter(where c.verification_level in ('workflow_source','owner_confirmed','field_evidence')) as workflow_or_better,
  count(distinct c.id) filter(where c.stage='owner_ready') as owner_ready,
  count(distinct c.id) filter(where c.stage='locked_field_case') as locked
from domains d
left join organizations o on o.primary_domain_id=d.id
left join programs p on p.primary_domain_id=d.id
left join cases c on c.primary_domain_id=d.id
group by d.id,d.legacy_id,d.name;

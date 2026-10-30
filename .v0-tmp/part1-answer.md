```sql
-- NOT APPLIED
-- ============================================================
-- GLOVAL Ads (BETA) -- ads_* tables, triggers, RLS, grants
-- Part 1 of 2 (credit and free-quota RPCs are in part 2)
-- ============================================================

-- ------------------------------------------------------------
-- Shared trigger functions
-- ------------------------------------------------------------
create or replace function public.ads_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create or replace function public.ads_forbid_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'user_id is immutable on %', tg_table_name;
  end if;
  return new;
end
$$;

-- ------------------------------------------------------------
-- ads_connections
-- ------------------------------------------------------------
create table public.ads_connections (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  platform              text not null
                          check (platform in ('google_ads','meta','tiktok','linkedin','x')),
  external_account_id   text not null,
  external_account_name text,
  login_customer_id     text,
  refresh_token_enc     text,
  token_key_version     smallint not null default 1 check (token_key_version > 0),
  scopes                text[] not null default '{}',
  status                text not null default 'pending'
                          check (status in ('pending','active','revoked','error')),
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint ads_connections_user_platform_account_key
    unique (user_id, platform, external_account_id),
  constraint ads_connections_token_present
    check (status in ('revoked','error') or refresh_token_enc is not null)
);

create index ads_connections_user_idx
  on public.ads_connections (user_id, platform);
create index ads_connections_active_idx
  on public.ads_connections (platform)
  where status = 'active';
create index ads_connections_key_version_idx
  on public.ads_connections (token_key_version)
  where refresh_token_enc is not null;

create trigger ads_connections_touch
  before update on public.ads_connections
  for each row execute function public.ads_touch_updated_at();

create trigger ads_connections_owner_immutable
  before update on public.ads_connections
  for each row execute function public.ads_forbid_owner_change();

-- ------------------------------------------------------------
-- ads_brands
-- ------------------------------------------------------------
create table public.ads_brands (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete set null,
  source       text not null check (source in ('gloval_site','external_url')),
  url          text,
  display_name text,
  sector       text,
  language     text not null check (language in ('tr','en')),
  scan_summary jsonb,
  scanned_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ads_brands_source_shape check (
    (source = 'gloval_site' and project_id is not null)
    or (source = 'external_url' and url is not null)
  )
);

create index ads_brands_user_idx
  on public.ads_brands (user_id, created_at desc);
create index ads_brands_project_idx
  on public.ads_brands (project_id)
  where project_id is not null;

create trigger ads_brands_touch
  before update on public.ads_brands
  for each row execute function public.ads_touch_updated_at();

create trigger ads_brands_owner_immutable
  before update on public.ads_brands
  for each row execute function public.ads_forbid_owner_change();

-- ------------------------------------------------------------
-- ads_plans
-- ------------------------------------------------------------
create table public.ads_plans (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  brand_id             uuid not null references public.ads_brands(id) on delete cascade,
  connection_id        uuid references public.ads_connections(id) on delete set null,
  platform             text not null default 'google_ads'
                         check (platform in ('google_ads','meta','tiktok','linkedin','x')),
  status               text not null default 'draft'
                         check (status in ('draft','approved','published','failed')),
  plan                 jsonb not null,
  version              integer not null default 1 check (version > 0),
  currency             text not null default 'TRY' check (currency = 'TRY'),
  daily_budget_minor   integer check (daily_budget_minor is null or daily_budget_minor > 0),
  budget_cap_minor     integer check (budget_cap_minor is null or budget_cap_minor > 0),
  approved_at          timestamptz,
  published_at         timestamptz,
  external_campaign_id text,
  failure_reason       text,
  model                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint ads_plans_approval_requires_cap check (
    status in ('draft','failed')
    or (budget_cap_minor is not null
        and daily_budget_minor is not null
        and approved_at is not null)
  ),
  constraint ads_plans_daily_within_cap check (
    daily_budget_minor is null
    or budget_cap_minor is null
    or daily_budget_minor <= budget_cap_minor
  ),
  constraint ads_plans_publish_requires_connection check (
    status <> 'published'
    or (connection_id is not null
        and published_at is not null
        and external_campaign_id is not null)
  )
);

create index ads_plans_user_idx
  on public.ads_plans (user_id, status, updated_at desc);
create index ads_plans_brand_idx
  on public.ads_plans (brand_id);
create index ads_plans_connection_idx
  on public.ads_plans (connection_id)
  where connection_id is not null;
create unique index ads_plans_external_campaign_uniq
  on public.ads_plans (connection_id, external_campaign_id)
  where external_campaign_id is not null;

create trigger ads_plans_touch
  before update on public.ads_plans
  for each row execute function public.ads_touch_updated_at();

create trigger ads_plans_owner_immutable
  before update on public.ads_plans
  for each row execute function public.ads_forbid_owner_change();

create or replace function public.ads_plans_check_owners()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.ads_brands b
     where b.id = new.brand_id
       and b.user_id = new.user_id
  ) then
    raise exception 'brand does not belong to plan owner';
  end if;

  if new.connection_id is not null and not exists (
    select 1
      from public.ads_connections c
     where c.id = new.connection_id
       and c.user_id = new.user_id
  ) then
    raise exception 'connection does not belong to plan owner';
  end if;

  return new;
end
$$;

create trigger ads_plans_owners_check
  before insert or update of brand_id, connection_id, user_id
  on public.ads_plans
  for each row execute function public.ads_plans_check_owners();

-- ------------------------------------------------------------
-- ads_actions (append-only action log)
-- ------------------------------------------------------------
create table public.ads_actions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  plan_id       uuid references public.ads_plans(id) on delete set null,
  connection_id uuid references public.ads_connections(id) on delete set null,
  actor         text not null check (actor in ('user','ai','system')),
  action_type   text not null,
  target        jsonb,
  before_state  jsonb,
  after_state   jsonb,
  reversible    boolean not null default false,
  status        text not null default 'proposed'
                  check (status in ('proposed','approved','applied','failed','undone')),
  undone_of     uuid references public.ads_actions(id),
  credit_reason text,
  created_at    timestamptz not null default now(),
  applied_at    timestamptz
);

create index ads_actions_user_idx
  on public.ads_actions (user_id, created_at desc);
create index ads_actions_plan_idx
  on public.ads_actions (plan_id, created_at)
  where plan_id is not null;
create unique index ads_actions_one_undo_uniq
  on public.ads_actions (undone_of)
  where undone_of is not null;

create or replace function public.ads_actions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.user_id <> old.user_id
     or new.actor <> old.actor
     or new.action_type <> old.action_type
     or new.target is distinct from old.target
     or new.before_state is distinct from old.before_state
     or new.undone_of is distinct from old.undone_of
     or new.created_at <> old.created_at then
    raise exception 'ads_actions rows are append-only; only status, after_state and applied_at may change';
  end if;
  return new;
end
$$;

create trigger ads_actions_guard_trg
  before update on public.ads_actions
  for each row execute function public.ads_actions_guard();

create or replace function public.ads_actions_check_owners()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan_id is not null and not exists (
    select 1
      from public.ads_plans p
     where p.id = new.plan_id
       and p.user_id = new.user_id
  ) then
    raise exception 'plan does not belong to action owner';
  end if;

  if new.connection_id is not null and not exists (
    select 1
      from public.ads_connections c
     where c.id = new.connection_id
       and c.user_id = new.user_id
  ) then
    raise exception 'connection does not belong to action owner';
  end if;

  if new.undone_of is not null and not exists (
    select 1
      from public.ads_actions a
     where a.id = new.undone_of
       and a.user_id = new.user_id
  ) then
    raise exception 'undone action does not belong to action owner';
  end if;

  return new;
end
$$;

create trigger ads_actions_owners_check
  before insert on public.ads_actions
  for each row execute function public.ads_actions_check_owners();

-- ------------------------------------------------------------
-- Audit triggers: status changes are written to ads_actions.
-- Tokens and encrypted values are never read or logged here.
-- ------------------------------------------------------------
create or replace function public.ads_audit_plan_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ads_actions
      (user_id, plan_id, connection_id, actor, action_type, after_state, status, applied_at)
    values
      (new.user_id, new.id, new.connection_id, 'system', 'plan_created',
       jsonb_build_object('status', new.status, 'platform', new.platform),
       'applied', now());
  elsif new.status is distinct from old.status then
    insert into public.ads_actions
      (user_id, plan_id, connection_id, actor, action_type, before_state, after_state, status, applied_at)
    values
      (new.user_id, new.id, new.connection_id, 'system', 'plan_status_changed',
       jsonb_build_object('status', old.status),
       jsonb_build_object(
         'status', new.status,
         'daily_budget_minor', new.daily_budget_minor,
         'budget_cap_minor', new.budget_cap_minor
       ),
       'applied', now());
  end if;
  return new;
end
$$;

create trigger ads_plans_audit
  after insert or update of status on public.ads_plans
  for each row execute function public.ads_audit_plan_status();

create or replace function public.ads_audit_connection_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ads_actions
      (user_id, connection_id, actor, action_type, after_state, status, applied_at)
    values
      (new.user_id, new.id, 'system', 'connection_created',
       jsonb_build_object('platform', new.platform, 'status', new.status),
       'applied', now());
  elsif new.status is distinct from old.status then
    insert into public.ads_actions
      (user_id, connection_id, actor, action_type, before_state, after_state, status, applied_at)
    values
      (new.user_id, new.id, 'system', 'connection_status_changed',
       jsonb_build_object('status', old.status),
       jsonb_build_object('status', new.status, 'error', new.last_error),
       'applied', now());
  end if;
  return new;
end
$$;

create trigger ads_connections_audit
  after insert or update of status on public.ads_connections
  for each row execute function public.ads_audit_connection_status();

-- ------------------------------------------------------------
-- ads_recommendations
-- ------------------------------------------------------------
create table public.ads_recommendations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  plan_id         uuid references public.ads_plans(id) on delete cascade,
  kind            text not null,
  title           text not null,
  rationale       text,
  proposed_action jsonb,
  status          text not null default 'open'
                    check (status in ('open','accepted','dismissed','expired')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);

create index ads_recs_user_idx
  on public.ads_recommendations (user_id, status, created_at desc);
create index ads_recs_plan_idx
  on public.ads_recommendations (plan_id)
  where plan_id is not null;

create trigger ads_recommendations_owner_immutable
  before update on public.ads_recommendations
  for each row execute function public.ads_forbid_owner_change();

create or replace function public.ads_recommendations_check_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan_id is not null and not exists (
    select 1
      from public.ads_plans p
     where p.id = new.plan_id
       and p.user_id = new.user_id
  ) then
    raise exception 'plan does not belong to recommendation owner';
  end if;
  return new;
end
$$;

create trigger ads_recommendations_owner_check
  before insert or update of plan_id, user_id
  on public.ads_recommendations
  for each row execute function public.ads_recommendations_check_owner();

-- ------------------------------------------------------------
-- ads_usage_events (cost metering; no prompts or content stored)
-- ------------------------------------------------------------
create table public.ads_usage_events (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  anon_subject_hash  text,
  flow               text not null
                       check (flow in ('scan','plan','preview','image','revise',
                                       'optimization','assistant','publish')),
  model              text not null,
  input_tokens       integer check (input_tokens is null or input_tokens >= 0),
  output_tokens      integer check (output_tokens is null or output_tokens >= 0),
  est_cost_micro_usd bigint check (est_cost_micro_usd is null or est_cost_micro_usd >= 0),
  credits_charged    integer not null default 0 check (credits_charged >= 0),
  free_quota_used    boolean not null default false,
  outcome            text not null check (outcome in ('ok','error','refunded')),
  error_code         text,
  duration_ms        integer check (duration_ms is null or duration_ms >= 0),
  request_id         text,
  created_at         timestamptz not null default now()
);

create index ads_usage_user_idx
  on public.ads_usage_events (user_id, created_at desc)
  where user_id is not null;
create index ads_usage_flow_idx
  on public.ads_usage_events (flow, created_at desc);
create index ads_usage_created_idx
  on public.ads_usage_events (created_at desc);
create unique index ads_usage_request_uniq
  on public.ads_usage_events (request_id, flow)
  where request_id is not null;

-- ------------------------------------------------------------
-- ads_free_usage (free-quota counters, separate from the FREE plan pool)
-- subject examples: ads:user:<uuid>, ads:cookie:<hash>, ads:ip:<hash>, ads:global:anon
-- day is the Europe/Istanbul calendar day
-- ------------------------------------------------------------
create table public.ads_free_usage (
  subject text not null,
  day     date not null,
  used    integer not null default 0 check (used >= 0),
  primary key (subject, day)
);

create index ads_free_usage_day_idx
  on public.ads_free_usage (day);

-- ------------------------------------------------------------
-- ads_alerts (one admin alert per kind per day)
-- ------------------------------------------------------------
create table public.ads_alerts (
  kind       text not null,
  day        date not null,
  detail     jsonb,
  created_at timestamptz not null default now(),
  primary key (kind, day)
);

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.ads_connections     enable row level security;
alter table public.ads_brands          enable row level security;
alter table public.ads_plans           enable row level security;
alter table public.ads_actions         enable row level security;
alter table public.ads_recommendations enable row level security;
alter table public.ads_usage_events    enable row level security;
alter table public.ads_free_usage      enable row level security;
alter table public.ads_alerts          enable row level security;

create policy ads_connections_select_own on public.ads_connections
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy ads_brands_select_own on public.ads_brands
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy ads_plans_select_own on public.ads_plans
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy ads_actions_select_own on public.ads_actions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy ads_recommendations_select_own on public.ads_recommendations
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy ads_usage_events_select_own on public.ads_usage_events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ads_free_usage and ads_alerts: no policies, so anon and authenticated see no rows.
-- No INSERT/UPDATE/DELETE policies exist on any ads_* table: clients cannot write.
-- service_role bypasses RLS.

-- ------------------------------------------------------------
-- Table privileges
-- ------------------------------------------------------------
revoke all on table
  public.ads_connections,
  public.ads_brands,
  public.ads_plans,
  public.ads_actions,
  public.ads_recommendations,
  public.ads_usage_events,
  public.ads_free_usage,
  public.ads_alerts
from anon, authenticated;

-- anon: no access to any ads_* table.

-- authenticated: SELECT only (RLS limits rows to the owner).
grant select on table
  public.ads_brands,
  public.ads_plans,
  public.ads_actions,
  public.ads_recommendations,
  public.ads_usage_events
to authenticated;

-- authenticated on ads_connections: column-level SELECT, token columns excluded
-- (refresh_token_enc and token_key_version are not readable by clients).
grant select (
  id,
  user_id,
  platform,
  external_account_id,
  external_account_name,
  login_customer_id,
  scopes,
  status,
  last_error,
  created_at,
  updated_at
) on table public.ads_connections to authenticated;

-- service_role: full DML on every ads_* table.
grant select, insert, update, delete on table
  public.ads_connections,
  public.ads_brands,
  public.ads_plans,
  public.ads_actions,
  public.ads_recommendations,
  public.ads_usage_events,
  public.ads_free_usage,
  public.ads_alerts
to service_role;

-- ------------------------------------------------------------
-- Trigger-function privileges: not callable by clients.
-- ------------------------------------------------------------
revoke all on function public.ads_touch_updated_at()           from public, anon, authenticated;
revoke all on function public.ads_forbid_owner_change()        from public, anon, authenticated;
revoke all on function public.ads_plans_check_owners()         from public, anon, authenticated;
revoke all on function public.ads_actions_guard()              from public, anon, authenticated;
revoke all on function public.ads_actions_check_owners()       from public, anon, authenticated;
revoke all on function public.ads_audit_plan_status()          from public, anon, authenticated;
revoke all on function public.ads_audit_connection_status()    from public, anon, authenticated;
revoke all on function public.ads_recommendations_check_owner() from public, anon, authenticated;
```
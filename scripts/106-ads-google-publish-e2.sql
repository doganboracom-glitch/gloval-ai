-- REQUIRED PREREQUISITES (already present in the live database; do not apply here):
--   * scripts/089-ads-core-part1.sql and scripts/090-ads-core-part2.sql
--   * scripts/091-ads-google-readonly.sql
--   * scripts/099-ads-google-public-readonly-quotas.sql, including its six-argument
--     ads_reserve_google_api_operation and ads_save_google_ads_connection_with_limit.
-- UNAPPLIED DRAFT — NOT APPLIED. This replaces the unapplied 094/095 publish drafts.
-- It never recreates or drops the old four-argument read quota RPC and never replaces
-- the live six-argument read RPC or connection-limit RPC. Existing ads_plans and
-- ads_actions grants/policies are preserved. All changes below are one transaction.

begin;

-- E1 lifecycle fields required by the E2 publish state machine and the existing
-- server-side beginAdsPublish compatibility wrapper.
alter table public.ads_plans
  drop constraint if exists ads_plans_status_check;
alter table public.ads_plans
  add constraint ads_plans_status_check
  check (status in ('draft', 'approved', 'publishing', 'reconciling', 'published', 'failed'));

alter table public.ads_plans
  add column if not exists approved_version integer,
  add column if not exists approval_summary jsonb not null default '{}'::jsonb,
  add column if not exists publish_request_id uuid,
  add column if not exists publish_started_at timestamptz,
  add column if not exists publish_billing_verified boolean,
  add column if not exists google_campaign_status text not null default 'PAUSED';

update public.ads_plans
   set approved_version = version
 where status in ('approved', 'publishing', 'reconciling', 'published')
   and approved_version is null;

alter table public.ads_plans
  drop constraint if exists ads_plans_approved_version_check;
alter table public.ads_plans
  add constraint ads_plans_approved_version_check
  check (approved_version is null or approved_version between 1 and version);

alter table public.ads_plans
  drop constraint if exists ads_plans_google_campaign_status_check;
alter table public.ads_plans
  add constraint ads_plans_google_campaign_status_check
  check (google_campaign_status in ('PAUSED', 'ENABLED'));

create unique index if not exists ads_plans_publish_request_uniq
  on public.ads_plans (publish_request_id)
  where publish_request_id is not null;
create index if not exists ads_plans_stale_publish_idx
  on public.ads_plans (publish_started_at)
  where status = 'publishing' and publish_started_at is not null;

alter table public.ads_plans
  add column if not exists approval_id uuid,
  add column if not exists approval_hash text,
  add column if not exists validation_hash text,
  add column if not exists validated_version integer,
  add column if not exists validated_at timestamptz,
  add column if not exists eu_political_advertising text,
  add column if not exists eu_political_declaration_confirmed_at timestamptz,
  add column if not exists approval_user_daily_budget_limit_minor integer,
  add column if not exists google_daily_budget_minor integer,
  add column if not exists publish_credit_charged boolean not null default false;

alter table public.ads_plans
  drop constraint if exists ads_plans_eu_political_advertising_check,
  drop constraint if exists ads_plans_approval_hash_check,
  drop constraint if exists ads_plans_daily_budget_limit_check,
  drop constraint if exists ads_plans_google_daily_budget_check;
alter table public.ads_plans
  add constraint ads_plans_eu_political_advertising_check
    check (eu_political_advertising is null or eu_political_advertising in ('yes', 'no')),
  add constraint ads_plans_approval_hash_check
    check (approval_hash is null or approval_hash ~ '^[0-9a-f]{64}$'),
  add constraint ads_plans_daily_budget_limit_check
    check (approval_user_daily_budget_limit_minor is null or approval_user_daily_budget_limit_minor > 0),
  add constraint ads_plans_google_daily_budget_check
    check (google_daily_budget_minor is null or google_daily_budget_minor >= 0);

create table if not exists public.ads_google_publish_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.ads_plans(id) on delete cascade,
  plan_version integer not null check (plan_version > 0),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  connection_id uuid not null references public.ads_connections(id) on delete no action,
  customer_id text not null check (customer_id ~ '^[0-9-]{1,32}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  daily_budget_minor integer not null check (daily_budget_minor > 0),
  budget_cap_minor integer not null check (budget_cap_minor >= daily_budget_minor),
  user_daily_budget_limit_minor integer not null check (user_daily_budget_limit_minor >= daily_budget_minor),
  eu_political_advertising text not null check (eu_political_advertising in ('yes', 'no')),
  eu_declaration_confirmed_at timestamptz not null,
  terms_accepted_at timestamptz not null,
  approval_summary jsonb not null,
  approved_at timestamptz not null default now(),
  unique (plan_id, plan_version)
);

create index if not exists ads_google_publish_approvals_user_idx
  on public.ads_google_publish_approvals (user_id, approved_at desc);

alter table public.ads_plans
  drop constraint if exists ads_plans_approval_id_fkey;
alter table public.ads_plans
  add constraint ads_plans_approval_id_fkey
  foreign key (approval_id) references public.ads_google_publish_approvals(id) on delete set null;

create table if not exists public.ads_google_publish_credit_reservations (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.ads_plans(id) on delete cascade,
  amount integer not null check (amount = 15),
  status text not null check (status in ('reserved', 'charged', 'released')),
  ledger_reason text not null unique check (ledger_reason ~ '^ads:publish:[A-Za-z0-9_-]{8,128}$'),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists ads_google_publish_credit_reservations_user_active_idx
  on public.ads_google_publish_credit_reservations (user_id, created_at)
  where status = 'reserved';
create index if not exists ads_google_publish_credit_reservations_plan_idx
  on public.ads_google_publish_credit_reservations (plan_id, created_at desc);

alter table public.ads_actions
  add column if not exists idempotency_key uuid,
  add column if not exists approval_hash text,
  add column if not exists expected_version integer,
  add column if not exists failure_reason text;

alter table public.ads_actions
  drop constraint if exists ads_actions_approval_hash_check;
alter table public.ads_actions
  add constraint ads_actions_approval_hash_check
  check (approval_hash is null or approval_hash ~ '^[0-9a-f]{64}$');
create unique index if not exists ads_actions_idempotency_key_uniq
  on public.ads_actions (user_id, idempotency_key)
  where idempotency_key is not null;

-- Count mutate operations, not just HTTP requests. Read reservations inserted by
-- the live 099 function receive the default count of 1.
alter table public.ads_google_api_operations
  add column if not exists operation_count integer not null default 1;

alter table public.ads_google_api_operations
  drop constraint if exists ads_google_api_operations_operation_count_check;
alter table public.ads_google_api_operations
  add constraint ads_google_api_operations_operation_count_check
  check (operation_count between 1 and 100);

create index if not exists ads_google_api_operations_user_method_created_idx
  on public.ads_google_api_operations (user_id, method, created_at);

alter table public.ads_google_api_operations
  drop constraint if exists ads_google_api_operations_method_check;
alter table public.ads_google_api_operations
  add constraint ads_google_api_operations_method_check
  check (method in (
    'customers.listAccessibleCustomers',
    'googleAds.search',
    'googleAds.searchStream',
    'googleAds.mutate',
    'ads.mutateAds',
    'geoTargetConstants.suggest'
  ));

create or replace function public.ads_plans_guard_version_and_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.version is null or new.version < 1 then
      raise exception 'ads plan version must be positive';
    end if;
    if new.status = 'approved' then
      new.approved_version := new.version;
    else
      new.approved_version := null;
    end if;
    return new;
  end if;

  v_plan_changed := new.brand_id is distinct from old.brand_id
    or new.connection_id is distinct from old.connection_id
    or new.platform is distinct from old.platform
    or new.plan is distinct from old.plan
    or new.currency is distinct from old.currency
    or new.daily_budget_minor is distinct from old.daily_budget_minor
    or new.budget_cap_minor is distinct from old.budget_cap_minor;

  if v_plan_changed then
    if old.status in ('publishing', 'reconciling', 'published') then
      raise exception 'ads plan is locked after publishing begins';
    end if;
    new.version := old.version + 1;
    new.status := 'draft';
    new.approved_at := null;
    new.approved_version := null;
    new.approval_summary := '{}'::jsonb;
    new.approval_id := null;
    new.approval_hash := null;
    new.validation_hash := null;
    new.validated_version := null;
    new.validated_at := null;
    new.eu_political_advertising := null;
    new.eu_political_declaration_confirmed_at := null;
    new.approval_user_daily_budget_limit_minor := null;
    new.publish_credit_charged := false;
    new.publish_request_id := null;
    new.publish_started_at := null;
    new.publish_billing_verified := null;
    new.external_campaign_id := null;
    new.published_at := null;
    new.google_campaign_status := 'PAUSED';
    new.google_daily_budget_minor := null;
    new.failure_reason := null;
  else
    new.version := old.version;
  end if;

  if new.status = 'approved' then
    new.approved_version := new.version;
  elsif new.status = 'draft' then
    new.approved_at := null;
    new.approved_version := null;
    new.approval_summary := '{}'::jsonb;
  end if;

  return new;
end
$$;

drop trigger if exists ads_plans_version_guard on public.ads_plans;
create trigger ads_plans_version_guard
  before insert or update on public.ads_plans
  for each row execute function public.ads_plans_guard_version_and_approval();

create or replace function public.ads_actions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;
  if new.id <> old.id
    or new.user_id <> old.user_id
    or new.actor <> old.actor
    or new.action_type <> old.action_type
    or new.target is distinct from old.target
    or new.before_state is distinct from old.before_state
    or new.reversible is distinct from old.reversible
    or new.undone_of is distinct from old.undone_of
    or new.credit_reason is distinct from old.credit_reason
    or new.idempotency_key is distinct from old.idempotency_key
    or new.approval_hash is distinct from old.approval_hash
    or new.expected_version is distinct from old.expected_version
    or new.created_at <> old.created_at then
    raise exception 'ads action audit fields are immutable';
  end if;
  if old.status not in ('proposed', 'approved') then
    raise exception 'ads action is immutable after completion';
  end if;
  if new.status not in ('proposed', 'approved', 'applied', 'failed', 'undone') then
    raise exception 'invalid ads action status';
  end if;
  return new;
end
$$;

drop trigger if exists ads_actions_guard_trg on public.ads_actions;
create trigger ads_actions_guard_trg
  before update on public.ads_actions
  for each row execute function public.ads_actions_guard();

-- Active publish reservations reduce spendable credits, but the 15-credit charge
-- is inserted only after Google confirms campaign creation (or an admin reconciles it).
create or replace function public.ads_charge_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text
)
returns table (ok boolean, balance integer, already_charged boolean, charged_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_existing integer;
  v_reserved integer;
  v_exclude_request text;
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000 then
    raise exception 'amount must be between 1 and 1000';
  end if;
  if p_reason is null or p_reason !~ '^ads:[a-z_]{1,32}:[A-Za-z0-9_-]{8,128}$' then
    raise exception 'reason must match ads:<action>:<requestId>';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));
  select coalesce(sum(t.amount), 0)::integer into v_balance
    from public.ai_credit_transactions t where t.user_id = p_user_id;
  select -t.amount into v_existing
    from public.ai_credit_transactions t
   where t.user_id = p_user_id and t.reason = p_reason and t.amount < 0 limit 1;
  if v_existing is not null then
    return query select true, v_balance, true, v_existing;
    return;
  end if;

  v_exclude_request := case when p_reason like 'ads:publish:%'
    then pg_catalog.split_part(p_reason, ':', 3) else null end;
  select coalesce(sum(r.amount), 0)::integer into v_reserved
    from public.ads_google_publish_credit_reservations r
   where r.user_id = p_user_id and r.status = 'reserved'
     and (v_exclude_request is null or r.request_id::text <> v_exclude_request);
  if v_balance - v_reserved < p_amount then
    return query select false, greatest(v_balance - v_reserved, 0), false, 0;
    return;
  end if;

  insert into public.ai_credit_transactions (user_id, kind, amount, reason)
  values (p_user_id, 'usage', -p_amount, p_reason);
  return query select true, v_balance - p_amount, false, p_amount;
end
$$;

-- Kept because lib/ads/credits.ts still exposes beginAdsPublish and calls this
-- legacy direct-charge RPC. New E2 publishing uses the reservation-backed _e2 RPC.
create or replace function public.ads_begin_google_ads_publish(
  p_user_id uuid,
  p_plan_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_cpc_bid_ceiling_minor integer,
  p_cpc_bid_ceiling_micros bigint,
  p_currency_fraction_digits smallint
)
returns table(state text, balance integer, already_charged boolean, charged_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
  v_charge record;
  v_one_unit_minor integer;
  v_expected_cpc_minor integer;
  v_expected_cpc_micros bigint;
begin
  if p_user_id is null or p_plan_id is null or p_request_id is null then
    raise exception 'user, plan, and request ids are required';
  end if;

  select p.* into v_plan
    from public.ads_plans p
   where p.id = p_plan_id and p.user_id = p_user_id
   for update;
  if not found then return query select 'not_found'::text, 0, false, 0; return; end if;
  if p_expected_version is null or v_plan.version is distinct from p_expected_version
    or v_plan.approved_version is distinct from p_expected_version then
    return query select 'plan_changed'::text, 0, false, 0; return;
  end if;
  if v_plan.status = 'published' and v_plan.external_campaign_id is not null then
    return query select 'already_published'::text, 0, false, 0; return;
  end if;
  if v_plan.status in ('publishing', 'reconciling') then
    return query select 'in_progress'::text, 0, false, 0; return;
  end if;
  if v_plan.status <> 'approved' or v_plan.connection_id is null
    or v_plan.daily_budget_minor is null or v_plan.budget_cap_minor is null
    or v_plan.daily_budget_minor > v_plan.budget_cap_minor
    or p_currency_fraction_digits is null or p_currency_fraction_digits not between 0 and 6
    or p_cpc_bid_ceiling_minor is null or p_cpc_bid_ceiling_micros is null then
    return query select 'invalid_state'::text, 0, false, 0; return;
  end if;
  if exists (
    select 1 from public.ads_connections c
     where c.id = v_plan.connection_id and c.user_id = p_user_id
       and c.status = 'active' and c.currency_code is distinct from v_plan.currency
  ) then
    return query select 'currency_mismatch'::text, 0, false, 0; return;
  end if;
  if not exists (
    select 1 from public.ads_connections c
     where c.id = v_plan.connection_id and c.user_id = p_user_id
       and c.platform = 'google_ads' and c.status = 'active' and not c.is_manager
  ) then
    return query select 'invalid_state'::text, 0, false, 0; return;
  end if;

  v_one_unit_minor := pg_catalog.power(10, p_currency_fraction_digits)::integer;
  if v_plan.daily_budget_minor < v_one_unit_minor then
    return query select 'invalid_state'::text, 0, false, 0; return;
  end if;
  v_expected_cpc_minor := least(
    v_plan.daily_budget_minor,
    greatest(v_one_unit_minor, pg_catalog.floor(v_plan.daily_budget_minor / 10.0)::integer)
  );
  v_expected_cpc_micros := v_expected_cpc_minor::bigint
    * pg_catalog.power(10, 6 - p_currency_fraction_digits)::bigint;
  if p_cpc_bid_ceiling_minor is distinct from v_expected_cpc_minor
    or p_cpc_bid_ceiling_micros is distinct from v_expected_cpc_micros then
    return query select 'invalid_state'::text, 0, false, 0; return;
  end if;

  select * into v_charge from public.ads_charge_credits(
    p_user_id, 15, 'ads:publish:' || p_request_id::text
  );
  if not v_charge.ok then
    return query select 'insufficient_credits'::text, v_charge.balance, false, 0; return;
  end if;

  update public.ads_plans p set
    status = 'publishing',
    publish_request_id = p_request_id,
    publish_started_at = pg_catalog.clock_timestamp(),
    publish_billing_verified = null,
    publish_credit_charged = true,
    approval_summary = pg_catalog.jsonb_build_object(
      'version', v_plan.version,
      'currency', v_plan.currency,
      'dailyBudgetMinor', v_plan.daily_budget_minor,
      'budgetCapMinor', v_plan.budget_cap_minor,
      'cpcBidCeilingMinor', v_expected_cpc_minor,
      'cpcBidCeilingMicros', v_expected_cpc_micros::text,
      'currencyFractionDigits', p_currency_fraction_digits
    ),
    google_campaign_status = 'PAUSED',
    failure_reason = null
   where p.id = p_plan_id and p.user_id = p_user_id;

  return query select 'started'::text, v_charge.balance, v_charge.already_charged, v_charge.charged_amount;
end;
$$;

create or replace function public.ads_create_google_ads_plan_draft_e2(
  p_user_id uuid,
  p_connection_id uuid,
  p_plan jsonb,
  p_display_name text,
  p_sector text,
  p_language text,
  p_daily_budget_minor integer,
  p_budget_cap_minor integer,
  p_currency text
)
returns table(state text, plan_id uuid, plan_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.ads_connections%rowtype;
  v_brand_id uuid;
  v_plan_id uuid;
begin
  if p_user_id is null or p_connection_id is null then raise exception 'user and connection are required'; end if;
  if p_plan is null or pg_catalog.jsonb_typeof(p_plan) is distinct from 'object'
    or p_display_name is null or pg_catalog.length(p_display_name) not between 1 and 80
    or p_sector is null or pg_catalog.length(p_sector) not between 1 and 60
    or p_language not in ('tr', 'en')
    or p_daily_budget_minor is null or p_daily_budget_minor <= 0
    or p_budget_cap_minor is null or p_budget_cap_minor < p_daily_budget_minor
    or p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    return query select 'invalid_plan'::text, null::uuid, null::integer; return;
  end if;
  if p_plan->>'finalUrl' is null or p_plan->>'finalUrl' !~ '^https://' then
    return query select 'invalid_plan'::text, null::uuid, null::integer; return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text || ':' || p_currency)
  );
  select c.* into v_connection from public.ads_connections c
   where c.id = p_connection_id and c.user_id = p_user_id
     and c.platform = 'google_ads' and c.status = 'active' for update;
  if not found then return query select 'connection_not_found'::text, null::uuid, null::integer; return; end if;
  if v_connection.is_manager or v_connection.currency_code is distinct from p_currency then
    return query select 'connection_ineligible'::text, null::uuid, null::integer; return;
  end if;

  insert into public.ads_brands (user_id, source, url, display_name, sector, language)
  values (p_user_id, 'external_url', p_plan->>'finalUrl', p_display_name, p_sector, p_language)
  returning id into v_brand_id;
  insert into public.ads_plans (
    user_id, brand_id, connection_id, platform, status, plan, version,
    currency, daily_budget_minor, budget_cap_minor, google_campaign_status
  ) values (
    p_user_id, v_brand_id, p_connection_id, 'google_ads', 'draft', p_plan, 1,
    p_currency, p_daily_budget_minor, p_budget_cap_minor, 'PAUSED'
  ) returning id into v_plan_id;
  return query select 'created'::text, v_plan_id, 1;
end
$$;

create or replace function public.ads_approve_google_ads_plan_e2(
  p_user_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_connection_id uuid,
  p_customer_id text,
  p_currency text,
  p_daily_budget_minor integer,
  p_budget_cap_minor integer,
  p_user_daily_budget_limit_minor integer,
  p_plan_hash text,
  p_eu_political_advertising text,
  p_eu_declaration_confirmed boolean,
  p_terms_accepted boolean,
  p_approval_summary jsonb
)
returns table(state text, approval_id uuid, plan_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
  v_connection public.ads_connections%rowtype;
  v_approval public.ads_google_publish_approvals%rowtype;
  v_used integer;
begin
  if p_user_id is null or p_plan_id is null or p_connection_id is null then
    raise exception 'user, plan, and connection are required';
  end if;
  if p_plan_hash is null or p_plan_hash !~ '^[0-9a-f]{64}$'
    or p_expected_version is null or p_expected_version < 1 then
    return query select 'invalid_approval'::text, null::uuid, null::integer; return;
  end if;
  if p_eu_political_advertising not in ('yes', 'no') or p_eu_declaration_confirmed is distinct from true
    or p_terms_accepted is distinct from true then
    return query select 'confirmation_required'::text, null::uuid, null::integer; return;
  end if;
  if p_daily_budget_minor is null or p_daily_budget_minor <= 0
    or p_budget_cap_minor is null or p_budget_cap_minor < p_daily_budget_minor
    or p_user_daily_budget_limit_minor is null or p_user_daily_budget_limit_minor < p_daily_budget_minor
    or p_currency is null or p_currency !~ '^[A-Z]{3}$'
    or p_customer_id is null or p_customer_id !~ '^[0-9-]{1,32}$' then
    return query select 'invalid_budget'::text, null::uuid, null::integer; return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text || ':' || p_currency)
  );
  select p.* into v_plan from public.ads_plans p
   where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then return query select 'not_found'::text, null::uuid, null::integer; return; end if;
  if v_plan.version is distinct from p_expected_version
    or v_plan.connection_id is distinct from p_connection_id
    or v_plan.currency is distinct from p_currency
    or v_plan.daily_budget_minor is distinct from p_daily_budget_minor
    or v_plan.budget_cap_minor is distinct from p_budget_cap_minor then
    return query select 'plan_changed'::text, null::uuid, v_plan.version; return;
  end if;
  if v_plan.status not in ('draft', 'failed', 'approved') then
    return query select 'plan_locked'::text, null::uuid, v_plan.version; return;
  end if;
  select c.* into v_connection from public.ads_connections c
   where c.id = p_connection_id and c.user_id = p_user_id and c.platform = 'google_ads'
     and c.status = 'active' and c.external_account_id = p_customer_id for update;
  if not found then return query select 'connection_not_found'::text, null::uuid, v_plan.version; return; end if;
  if v_connection.currency_code is distinct from p_currency or v_connection.is_manager then
    return query select 'connection_ineligible'::text, null::uuid, v_plan.version; return;
  end if;

  select coalesce(sum(coalesce(p.google_daily_budget_minor, p.daily_budget_minor, 0)), 0)::integer
    into v_used from public.ads_plans p
   where p.user_id = p_user_id and p.currency = p_currency and p.id <> p_plan_id
     and p.status in ('approved', 'publishing', 'reconciling', 'published');
  if v_used + p_daily_budget_minor > p_user_daily_budget_limit_minor then
    return query select 'budget_limit_exceeded'::text, null::uuid, v_plan.version; return;
  end if;

  select a.* into v_approval from public.ads_google_publish_approvals a
   where a.plan_id = p_plan_id and a.plan_version = p_expected_version for update;
  if found then
    if v_approval.plan_hash is distinct from p_plan_hash
      or v_approval.eu_political_advertising is distinct from p_eu_political_advertising then
      return query select 'plan_changed'::text, null::uuid, v_plan.version; return;
    end if;
    update public.ads_plans p set
      status = 'approved', approval_id = v_approval.id, approval_hash = v_approval.plan_hash,
      approval_summary = p_approval_summary, approved_at = v_approval.approved_at,
      approved_version = p_expected_version, validation_hash = null,
      validated_version = null, validated_at = null,
      eu_political_advertising = p_eu_political_advertising,
      eu_political_declaration_confirmed_at = v_approval.eu_declaration_confirmed_at,
      approval_user_daily_budget_limit_minor = p_user_daily_budget_limit_minor
    where p.id = p_plan_id and p.user_id = p_user_id;
    return query select 'approved'::text, v_approval.id, p_expected_version; return;
  end if;

  insert into public.ads_google_publish_approvals (
    user_id, plan_id, plan_version, plan_hash, connection_id, customer_id, currency,
    daily_budget_minor, budget_cap_minor, user_daily_budget_limit_minor,
    eu_political_advertising, eu_declaration_confirmed_at, terms_accepted_at,
    approval_summary
  ) values (
    p_user_id, p_plan_id, p_expected_version, p_plan_hash, p_connection_id, p_customer_id,
    p_currency, p_daily_budget_minor, p_budget_cap_minor, p_user_daily_budget_limit_minor,
    p_eu_political_advertising, now(), now(), coalesce(p_approval_summary, '{}'::jsonb)
  ) returning * into v_approval;

  update public.ads_plans p set
    status = 'approved', approval_id = v_approval.id, approval_hash = p_plan_hash,
    approval_summary = coalesce(p_approval_summary, '{}'::jsonb), approved_at = now(),
    approved_version = p_expected_version, validation_hash = null,
    validated_version = null, validated_at = null,
    eu_political_advertising = p_eu_political_advertising,
    eu_political_declaration_confirmed_at = v_approval.eu_declaration_confirmed_at,
    approval_user_daily_budget_limit_minor = p_user_daily_budget_limit_minor
  where p.id = p_plan_id and p.user_id = p_user_id;
  return query select 'approved'::text, v_approval.id, p_expected_version;
end
$$;

create or replace function public.ads_record_google_ads_validation_e2(
  p_user_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_approval_id uuid,
  p_plan_hash text
)
returns table(state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
begin
  select p.* into v_plan from public.ads_plans p
   where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then return query select 'not_found'::text; return; end if;
  if v_plan.status is distinct from 'approved'
    or v_plan.version is distinct from p_expected_version
    or v_plan.approved_version is distinct from p_expected_version
    or v_plan.approval_id is distinct from p_approval_id
    or v_plan.approval_hash is distinct from p_plan_hash then
    return query select 'plan_changed'::text; return;
  end if;
  update public.ads_plans p set validation_hash = p_plan_hash,
    validated_version = p_expected_version, validated_at = now()
   where p.id = p_plan_id and p.user_id = p_user_id;
  return query select 'validated'::text;
end
$$;

create or replace function public.ads_begin_google_ads_publish_e2(
  p_user_id uuid,
  p_plan_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_approval_id uuid,
  p_plan_hash text,
  p_user_daily_budget_limit_minor integer,
  p_cpc_bid_ceiling_minor integer,
  p_cpc_bid_ceiling_micros bigint,
  p_currency_fraction_digits smallint
)
returns table(state text, balance integer, already_charged boolean, charged_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
  v_existing public.ads_google_publish_credit_reservations%rowtype;
  v_balance integer;
  v_reserved integer;
  v_cpc_minor integer;
  v_cpc_micros bigint;
  v_currency_digits smallint;
  v_one_unit_minor integer;
begin
  if p_user_id is null or p_plan_id is null or p_request_id is null then
    raise exception 'user, plan, and request ids are required';
  end if;
  if p_plan_hash is null or p_plan_hash !~ '^[0-9a-f]{64}$' then
    return query select 'plan_changed'::text, 0, false, 0; return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text || ':' || coalesce((select p.currency from public.ads_plans p where p.id = p_plan_id and p.user_id = p_user_id), ''))
  );

  select p.* into v_plan from public.ads_plans p
   where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then return query select 'not_found'::text, 0, false, 0; return; end if;
  select r.* into v_existing from public.ads_google_publish_credit_reservations r
   where r.request_id = p_request_id for update;
  if found then
    if v_existing.user_id is distinct from p_user_id or v_existing.plan_id is distinct from p_plan_id then
      return query select 'plan_changed'::text, 0, false, 0; return;
    end if;
    if v_existing.status = 'reserved' then
      if v_plan.publish_request_id is distinct from p_request_id then
        return query select 'plan_changed'::text, 0, false, 0; return;
      end if;
      if v_plan.status = 'reconciling' then
        return query select 'publish_in_progress'::text, 0, false, 0; return;
      end if;
      if v_plan.status is distinct from 'publishing' then
        return query select 'plan_changed'::text, 0, false, 0; return;
      end if;
      select coalesce(sum(t.amount), 0)::integer into v_balance
        from public.ai_credit_transactions t where t.user_id = p_user_id;
      select coalesce(sum(r.amount), 0)::integer into v_reserved
        from public.ads_google_publish_credit_reservations r where r.user_id = p_user_id and r.status = 'reserved';
      return query select 'started'::text, greatest(v_balance - v_reserved, 0), false, 0; return;
    end if;
    if v_existing.status = 'charged' then
      if v_plan.status is distinct from 'published' or v_plan.publish_request_id is distinct from p_request_id then
        return query select 'plan_changed'::text, 0, false, 0; return;
      end if;
      return query select 'already_published'::text, 0, true, 15; return;
    end if;
    return query select 'plan_changed'::text, 0, false, 0; return;
  end if;

  if v_plan.version is distinct from p_expected_version
    or v_plan.approved_version is distinct from p_expected_version
    or v_plan.approval_id is distinct from p_approval_id
    or v_plan.approval_hash is distinct from p_plan_hash
    or v_plan.validation_hash is distinct from p_plan_hash
    or v_plan.validated_version is distinct from p_expected_version
    or v_plan.approval_user_daily_budget_limit_minor is distinct from p_user_daily_budget_limit_minor then
    return query select 'plan_changed'::text, 0, false, 0; return;
  end if;
  if v_plan.status = 'published' then return query select 'already_published'::text, 0, false, 0; return; end if;
  if v_plan.status in ('publishing', 'reconciling') then return query select 'publish_in_progress'::text, 0, false, 0; return; end if;
  if v_plan.status is distinct from 'approved' then return query select 'plan_not_approved'::text, 0, false, 0; return; end if;
  if v_plan.daily_budget_minor is null or v_plan.budget_cap_minor is null
    or v_plan.daily_budget_minor <= 0 or v_plan.daily_budget_minor > v_plan.budget_cap_minor
    or v_plan.daily_budget_minor > p_user_daily_budget_limit_minor then
    return query select 'budget_limit_exceeded'::text, 0, false, 0; return;
  end if;
  if v_plan.currency not in ('TRY', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'KRW') then
    return query select 'currency_mismatch'::text, 0, false, 0; return;
  end if;

  select case v_plan.currency when 'JPY' then 0 when 'KRW' then 0 else 2 end into v_currency_digits;
  if p_currency_fraction_digits is distinct from v_currency_digits then
    return query select 'currency_mismatch'::text, 0, false, 0; return;
  end if;
  if p_currency_fraction_digits is null or p_currency_fraction_digits not between 0 and 6 then
    return query select 'currency_mismatch'::text, 0, false, 0; return;
  end if;
  v_one_unit_minor := pg_catalog.power(10, p_currency_fraction_digits)::integer;
  if v_plan.daily_budget_minor < v_one_unit_minor then
    return query select 'invalid_budget'::text, 0, false, 0; return;
  end if;
  v_cpc_minor := least(
    v_plan.daily_budget_minor,
    greatest(v_one_unit_minor, pg_catalog.floor(v_plan.daily_budget_minor / 10.0)::integer)
  );
  v_cpc_micros := v_cpc_minor::bigint * pg_catalog.power(10, 6 - p_currency_fraction_digits)::bigint;
  if p_cpc_bid_ceiling_minor is distinct from v_cpc_minor
    or p_cpc_bid_ceiling_micros is distinct from v_cpc_micros then
    return query select 'plan_changed'::text, 0, false, 0; return;
  end if;

  select coalesce(sum(coalesce(p.google_daily_budget_minor, p.daily_budget_minor, 0)), 0)::integer
    into v_reserved from public.ads_plans p
   where p.user_id = p_user_id and p.currency = v_plan.currency and p.id <> p_plan_id
     and p.status in ('approved', 'publishing', 'reconciling', 'published');
  if v_reserved + v_plan.daily_budget_minor > p_user_daily_budget_limit_minor then
    return query select 'budget_limit_exceeded'::text, 0, false, 0; return;
  end if;

  select coalesce(sum(t.amount), 0)::integer into v_balance
    from public.ai_credit_transactions t where t.user_id = p_user_id;
  select coalesce(sum(r.amount), 0)::integer into v_reserved
    from public.ads_google_publish_credit_reservations r
   where r.user_id = p_user_id and r.status = 'reserved';
  if v_balance - v_reserved < 15 then
    return query select 'insufficient_credits'::text, greatest(v_balance - v_reserved, 0), false, 0; return;
  end if;

  insert into public.ads_google_publish_credit_reservations (
    request_id, user_id, plan_id, amount, status, ledger_reason
  ) values (
    p_request_id, p_user_id, p_plan_id, 15, 'reserved', 'ads:publish:' || p_request_id::text
  );
  update public.ads_plans p set status = 'publishing', publish_request_id = p_request_id,
    publish_started_at = now(), failure_reason = null
   where p.id = p_plan_id and p.user_id = p_user_id;
  return query select 'started'::text, greatest(v_balance - v_reserved - 15, 0), false, 0;
end
$$;

create or replace function public.ads_finalize_google_ads_publish_e2(
  p_user_id uuid,
  p_plan_id uuid,
  p_request_id uuid,
  p_external_campaign_id text,
  p_billing_verified boolean
)
returns table(state text, balance integer, already_charged boolean, charged_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
  v_reservation public.ads_google_publish_credit_reservations%rowtype;
  v_charge record;
  v_balance integer;
begin
  if p_user_id is null or p_plan_id is null or p_request_id is null
    or p_external_campaign_id is null or p_external_campaign_id !~ '^[0-9]{1,20}$' then
    return query select 'invalid_result'::text, 0, false, 0; return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));
  select p.* into v_plan from public.ads_plans p
   where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then return query select 'not_found'::text, 0, false, 0; return; end if;
  select r.* into v_reservation from public.ads_google_publish_credit_reservations r
   where r.request_id = p_request_id and r.user_id = p_user_id and r.plan_id = p_plan_id for update;
  if not found then return query select 'reservation_missing'::text, 0, false, 0; return; end if;
  if v_reservation.status = 'charged' then
    if v_plan.status is distinct from 'published'
      or v_plan.publish_request_id is distinct from p_request_id
      or v_plan.external_campaign_id is distinct from p_external_campaign_id then
      return query select 'plan_changed'::text, 0, false, 0; return;
    end if;
    select coalesce(sum(t.amount), 0)::integer into v_balance from public.ai_credit_transactions t where t.user_id = p_user_id;
    return query select 'published'::text, v_balance, true, 0; return;
  end if;
  if v_reservation.status is distinct from 'reserved'
    or v_plan.status not in ('publishing', 'reconciling')
    or v_plan.publish_request_id is distinct from p_request_id then
    return query select 'plan_changed'::text, 0, false, 0; return;
  end if;

  select * into v_charge from public.ads_charge_credits(
    p_user_id, v_reservation.amount, v_reservation.ledger_reason
  );
  if not coalesce(v_charge.ok, false) then
    return query select 'insufficient_credits'::text, coalesce(v_charge.balance, 0), false, 0; return;
  end if;
  update public.ads_google_publish_credit_reservations r
    set status = 'charged', finished_at = now()
   where r.request_id = p_request_id;
  update public.ads_plans p set status = 'published', external_campaign_id = p_external_campaign_id,
    published_at = coalesce(p.published_at, now()), google_campaign_status = 'PAUSED',
    google_daily_budget_minor = coalesce(p.google_daily_budget_minor, p.daily_budget_minor),
    publish_billing_verified = p_billing_verified, publish_credit_charged = true, failure_reason = null
   where p.id = p_plan_id and p.user_id = p_user_id;
  return query select 'published'::text, v_charge.balance, v_charge.already_charged, v_charge.charged_amount;
end
$$;

create or replace function public.ads_release_google_ads_publish_e2(
  p_user_id uuid,
  p_plan_id uuid,
  p_request_id uuid,
  p_failure_reason text
)
returns table(released boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));
  select p.* into v_plan from public.ads_plans p
   where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then return query select false; return; end if;
  update public.ads_google_publish_credit_reservations r set status = 'released', finished_at = now()
   where r.request_id = p_request_id and r.user_id = p_user_id and r.plan_id = p_plan_id and r.status = 'reserved';
  if v_plan.publish_request_id is distinct from p_request_id or v_plan.status not in ('publishing', 'reconciling') then
    return query select false; return;
  end if;
  update public.ads_plans p set status = 'failed', failure_reason = left(coalesce(p_failure_reason, 'google_ads_publish_failed'), 80)
   where p.id = p_plan_id and p.user_id = p_user_id;
  return query select true;
end
$$;

create or replace function public.ads_resolve_google_ads_publish(
  p_plan_id uuid,
  p_request_id uuid,
  p_resolution text,
  p_external_campaign_id text default null,
  p_admin_email text default null
)
returns table(state text, refunded boolean, balance integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
  v_reservation public.ads_google_publish_credit_reservations%rowtype;
  v_charge record;
  v_refund record;
  v_admin_allowed boolean;
  v_legacy_charge_exists boolean;
  v_state text;
  v_refunded boolean := false;
  v_balance integer := 0;
begin
  if p_plan_id is null or p_request_id is null then raise exception 'plan and request ids are required'; end if;
  if p_resolution is null or p_resolution not in ('published', 'failed_refunded') then
    return query select 'invalid_resolution'::text, false, 0; return;
  end if;
  v_admin_allowed := p_admin_email is not null
    and p_admin_email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';
  if not coalesce(v_admin_allowed, false) then return query select 'admin_required'::text, false, 0; return; end if;

  select p.* into v_plan from public.ads_plans p
   where p.id = p_plan_id and p.publish_request_id = p_request_id and p.status = 'reconciling' for update;
  if not found then return query select 'not_reconciling'::text, false, 0; return; end if;
  select r.* into v_reservation from public.ads_google_publish_credit_reservations r
   where r.request_id = p_request_id and r.plan_id = p_plan_id for update;

  if p_resolution = 'published' then
    if p_external_campaign_id is null or p_external_campaign_id !~ '^[0-9]{1,20}$' then
      return query select 'invalid_campaign_id'::text, false, 0; return;
    end if;
    if found then
      if v_reservation.status not in ('reserved', 'charged') then
        return query select 'reservation_not_recoverable'::text, false, 0; return;
      end if;
      select * into v_charge from public.ads_charge_credits(v_plan.user_id, 15, v_reservation.ledger_reason);
      if not coalesce(v_charge.ok, false) then
        return query select 'insufficient_credits'::text, false, coalesce(v_charge.balance, 0); return;
      end if;
      update public.ads_google_publish_credit_reservations r set status = 'charged', finished_at = now()
       where r.request_id = p_request_id;
      v_balance := coalesce(v_charge.balance, 0);
    else
      -- E1 charged before the provider request and did not create a reservation row.
      select exists (
        select 1 from public.ai_credit_transactions t
         where t.user_id = v_plan.user_id
           and t.reason = 'ads:publish:' || p_request_id::text
           and t.amount < 0
      ) into v_legacy_charge_exists;
      if not v_legacy_charge_exists then
        return query select 'legacy_charge_missing'::text, false, 0; return;
      end if;
      select coalesce(sum(t.amount), 0)::integer into v_balance
        from public.ai_credit_transactions t where t.user_id = v_plan.user_id;
    end if;
    update public.ads_plans p set status = 'published', external_campaign_id = p_external_campaign_id,
      published_at = coalesce(p.published_at, now()), google_campaign_status = 'PAUSED',
      google_daily_budget_minor = coalesce(p.google_daily_budget_minor, p.daily_budget_minor),
      publish_credit_charged = true, failure_reason = null
     where p.id = p_plan_id;
    v_state := 'published';
  else
    if found and v_reservation.status = 'charged' then
      select * into v_refund from public.ads_refund_credits(v_plan.user_id, v_reservation.ledger_reason);
      v_refunded := coalesce(v_refund.refunded, false);
      v_balance := coalesce(v_refund.balance, 0);
      update public.ads_google_publish_credit_reservations r set status = 'released', finished_at = now()
       where r.request_id = p_request_id;
    elsif found and v_reservation.status = 'reserved' then
      update public.ads_google_publish_credit_reservations r set status = 'released', finished_at = now()
       where r.request_id = p_request_id;
      select coalesce(sum(t.amount), 0)::integer into v_balance
        from public.ai_credit_transactions t where t.user_id = v_plan.user_id;
    else
      -- Also handles legacy E1 charges and makes repeat refunds idempotent.
      select * into v_refund from public.ads_refund_credits(
        v_plan.user_id, 'ads:publish:' || p_request_id::text
      );
      v_refunded := coalesce(v_refund.refunded, false);
      v_balance := coalesce(v_refund.balance, 0);
    end if;
    update public.ads_plans p set status = 'failed',
      failure_reason = 'admin_marked_failed_refunded',
      publish_credit_charged = case when v_refunded then false else p.publish_credit_charged end
     where p.id = p_plan_id;
    v_state := 'failed_refunded';
  end if;

  insert into public.ads_actions
    (user_id, plan_id, connection_id, actor, action_type, before_state, after_state, status, applied_at)
  values
    (v_plan.user_id, v_plan.id, v_plan.connection_id, 'system', 'publish_reconciliation_resolved',
     pg_catalog.jsonb_build_object('status', 'reconciling', 'request_id', p_request_id),
     pg_catalog.jsonb_build_object(
       'status', v_state,
       'resolution', p_resolution,
       'external_campaign_id', p_external_campaign_id,
       'admin_email', p_admin_email,
       'refunded', v_refunded
     ),
     'applied', pg_catalog.clock_timestamp());

  return query select v_state, v_refunded, v_balance;
end
$$;

-- Required by /api/cron/ads-publish-reconcile. It only changes stale publishes
-- to reconciling and records that transition; it never replays a Google request.
create or replace function public.ads_reconcile_stale_google_ads_publishes(
  p_batch integer default 100
)
returns table(plan_id uuid, publish_request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
begin
  if p_batch is null or p_batch not between 1 and 500 then
    raise exception 'batch size must be between 1 and 500';
  end if;

  for v_plan in
    select p.* from public.ads_plans p
     where p.status = 'publishing'
       and p.publish_started_at < pg_catalog.clock_timestamp() - interval '10 minutes'
     order by p.publish_started_at, p.id
     limit p_batch
     for update skip locked
  loop
    update public.ads_plans p set status = 'reconciling', failure_reason = 'publish_stale_timeout'
     where p.id = v_plan.id and p.status = 'publishing';

    insert into public.ads_actions
      (user_id, plan_id, connection_id, actor, action_type, before_state, after_state, status, applied_at)
    values
      (v_plan.user_id, v_plan.id, v_plan.connection_id, 'system', 'publish_reconciliation_opened',
       pg_catalog.jsonb_build_object('status', 'publishing', 'request_id', v_plan.publish_request_id),
       pg_catalog.jsonb_build_object('status', 'reconciling', 'reason', 'publish_stale_timeout'),
       'applied', pg_catalog.clock_timestamp());

    plan_id := v_plan.id;
    publish_request_id := v_plan.publish_request_id;
    return next;
  end loop;
end
$$;

create or replace function public.ads_reserve_google_api_operation_v2(
  p_request_id uuid,
  p_user_id uuid,
  p_connection_id uuid,
  p_method text,
  p_operation_count integer
)
returns table(allowed boolean, global_used integer, user_used integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_global_used integer;
  v_global_bucket_used integer;
  v_user_used integer;
  v_is_write boolean;
begin
  if p_request_id is null or p_user_id is null then raise exception 'request and user ids are required'; end if;
  v_is_write := p_method in ('googleAds.mutate', 'ads.mutateAds');
  if p_method is null or p_method not in ('googleAds.mutate', 'ads.mutateAds', 'geoTargetConstants.suggest') then
    raise exception 'unsupported Google Ads API method';
  end if;
  if p_operation_count is null or p_operation_count not between 1 and 100 then
    raise exception 'Google Ads operation count is out of range';
  end if;
  if p_connection_id is null or not exists (
    select 1 from public.ads_connections c where c.id = p_connection_id
      and c.user_id = p_user_id and c.platform = 'google_ads' and c.status = 'active'
  ) then raise exception 'Google Ads connection does not belong to user'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gloval-google-ads-project-quota')::bigint);
  delete from public.ads_google_api_operations where created_at < v_now - interval '25 hours';
  select coalesce(sum(o.operation_count), 0)::integer into v_global_used
    from public.ads_google_api_operations o where o.created_at >= v_now - interval '24 hours';
  select coalesce(sum(o.operation_count), 0)::integer into v_global_bucket_used
    from public.ads_google_api_operations o
   where o.method in ('googleAds.mutate', 'ads.mutateAds') and o.created_at >= v_now - interval '24 hours';
  select coalesce(sum(o.operation_count), 0)::integer into v_user_used
    from public.ads_google_api_operations o where o.user_id = p_user_id
      and ((v_is_write and o.method in ('googleAds.mutate', 'ads.mutateAds'))
        or (not v_is_write and o.method not in ('googleAds.mutate', 'ads.mutateAds')))
      and o.created_at >= v_now - interval '24 hours';

  if v_global_used + p_operation_count > 2400
    or (v_is_write and (v_global_bucket_used + p_operation_count > 1200 or v_user_used + p_operation_count > 100))
    or (not v_is_write and (v_global_used - v_global_bucket_used + p_operation_count > 1200 or v_user_used + p_operation_count > 80)) then
    return query select false, v_global_used, v_user_used; return;
  end if;
  insert into public.ads_google_api_operations (request_id, user_id, connection_id, method, operation_count)
  values (p_request_id, p_user_id, p_connection_id, p_method, p_operation_count);
  return query select true, v_global_used + p_operation_count, v_user_used + p_operation_count;
end
$$;

create or replace function public.ads_begin_google_ads_campaign_action_e2(
  p_user_id uuid,
  p_plan_id uuid,
  p_action_id uuid,
  p_action_type text,
  p_expected_version integer,
  p_approval_hash text,
  p_target jsonb,
  p_before_state jsonb,
  p_user_daily_budget_limit_minor integer,
  p_user_confirmed boolean
)
returns table(state text, action_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
  v_action public.ads_actions%rowtype;
  v_target_budget integer;
  v_used integer;
begin
  if p_user_id is null or p_plan_id is null or p_action_id is null then raise exception 'user, plan, and action ids are required'; end if;
  if p_user_confirmed is distinct from true then return query select 'confirmation_required'::text, null::uuid; return; end if;
  if p_action_type not in ('google_ads_campaign_status_update', 'google_ads_budget_update', 'google_ads_ad_copy_update')
    or p_approval_hash is null or p_approval_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid_action'::text, null::uuid; return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text || ':' || coalesce((select p.currency from public.ads_plans p where p.id = p_plan_id and p.user_id = p_user_id), ''))
  );
  select p.* into v_plan from public.ads_plans p where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then return query select 'not_found'::text, null::uuid; return; end if;
  if v_plan.status is distinct from 'published' or v_plan.external_campaign_id is null
    or v_plan.version is distinct from p_expected_version or v_plan.approved_version is distinct from p_expected_version then
    return query select 'plan_changed'::text, null::uuid; return;
  end if;
  select a.* into v_action from public.ads_actions a where a.user_id = p_user_id and a.idempotency_key = p_action_id for update;
  if found then
    if v_action.plan_id is distinct from p_plan_id or v_action.action_type is distinct from p_action_type
      or v_action.approval_hash is distinct from p_approval_hash then
      return query select 'idempotency_conflict'::text, null::uuid; return;
    end if;
    return query select 'existing'::text, v_action.id; return;
  end if;
  if exists (
    select 1 from public.ads_actions a
     where a.plan_id = p_plan_id and a.user_id = p_user_id
       and a.status = 'approved' and a.action_type in (
         'google_ads_campaign_status_update', 'google_ads_budget_update', 'google_ads_ad_copy_update'
       )
  ) then
    return query select 'action_in_progress'::text, null::uuid; return;
  end if;
  if p_action_type = 'google_ads_budget_update' then
    v_target_budget := (p_target->>'dailyBudgetMinor')::integer;
    if v_target_budget is null or v_target_budget <= 0 or p_user_daily_budget_limit_minor is null
      or v_plan.budget_cap_minor is null or v_target_budget > v_plan.budget_cap_minor then
      return query select 'invalid_budget'::text, null::uuid; return;
    end if;
    select coalesce(sum(coalesce(p.google_daily_budget_minor, p.daily_budget_minor, 0)), 0)::integer into v_used
      from public.ads_plans p where p.user_id = p_user_id and p.currency = v_plan.currency
        and p.status in ('approved', 'publishing', 'reconciling', 'published');
    if v_used - coalesce(v_plan.google_daily_budget_minor, v_plan.daily_budget_minor, 0) + v_target_budget > p_user_daily_budget_limit_minor then
      return query select 'budget_limit_exceeded'::text, null::uuid; return;
    end if;
  end if;

  insert into public.ads_actions (
    id, user_id, plan_id, connection_id, actor, action_type, target, before_state,
    reversible, status, idempotency_key, approval_hash, expected_version
  ) values (
    p_action_id, p_user_id, p_plan_id, v_plan.connection_id, 'user', p_action_type,
    p_target, p_before_state, true, 'approved', p_action_id, p_approval_hash, p_expected_version
  ) returning * into v_action;
  return query select 'approved'::text, v_action.id;
end
$$;

create or replace function public.ads_finish_google_ads_campaign_action_e2(
  p_user_id uuid,
  p_action_id uuid,
  p_result text,
  p_after_state jsonb,
  p_failure_reason text default null
)
returns table(state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.ads_actions%rowtype;
  v_plan public.ads_plans%rowtype;
  v_budget integer;
  v_status text;
begin
  select a.* into v_action from public.ads_actions a
   where a.id = p_action_id and a.user_id = p_user_id for update;
  if not found then return query select 'not_found'::text; return; end if;
  if v_action.status = 'applied' then return query select 'applied'::text; return; end if;
  if v_action.status is distinct from 'approved' then return query select 'action_not_pending'::text; return; end if;
  if p_result not in ('applied', 'failed') then return query select 'invalid_result'::text; return; end if;

  if p_result = 'applied' then
    select p.* into v_plan from public.ads_plans p
     where p.id = v_action.plan_id and p.user_id = p_user_id and p.status = 'published' for update;
    if not found or v_plan.version is distinct from v_action.expected_version then
      return query select 'plan_changed'::text; return;
    end if;
    if v_action.action_type = 'google_ads_budget_update' then
      v_budget := (v_action.target->>'dailyBudgetMinor')::integer;
      if v_budget is null or v_budget <= 0 then return query select 'invalid_budget'::text; return; end if;
      update public.ads_plans p set google_daily_budget_minor = v_budget where p.id = v_plan.id and p.user_id = p_user_id;
    elsif v_action.action_type = 'google_ads_campaign_status_update' then
      v_status := v_action.target->>'status';
      if v_status not in ('PAUSED', 'ENABLED') then return query select 'invalid_status'::text; return; end if;
      update public.ads_plans p set google_campaign_status = v_status where p.id = v_plan.id and p.user_id = p_user_id;
    end if;
  end if;

  update public.ads_actions a set
    status = p_result,
    after_state = case when p_result = 'applied' then p_after_state else null end,
    failure_reason = case when p_result = 'failed' then left(coalesce(p_failure_reason, 'provider_error'), 80) else null end,
    applied_at = case when p_result = 'applied' then now() else null end
   where a.id = p_action_id and a.user_id = p_user_id;
  return query select p_result::text;
end
$$;

alter table public.ads_google_publish_approvals enable row level security;
alter table public.ads_google_publish_credit_reservations enable row level security;
revoke all on table public.ads_google_publish_approvals from public, anon, authenticated;
revoke all on table public.ads_google_publish_credit_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.ads_google_publish_approvals to service_role;
grant select, insert, update, delete on table public.ads_google_publish_credit_reservations to service_role;
-- Do not change ads_plans / ads_actions table grants or RLS policies. The live
-- authenticated SELECT + select_own policies remain intentional.

revoke all on function public.ads_plans_guard_version_and_approval() from public, anon, authenticated;
revoke all on function public.ads_actions_guard() from public, anon, authenticated;
revoke all on function public.ads_begin_google_ads_publish(uuid, uuid, uuid, integer, integer, bigint, smallint) from public, anon, authenticated;
revoke all on function public.ads_reconcile_stale_google_ads_publishes(integer) from public, anon, authenticated;
revoke all on function public.ads_charge_credits(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.ads_create_google_ads_plan_draft_e2(uuid, uuid, jsonb, text, text, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.ads_approve_google_ads_plan_e2(uuid, uuid, integer, uuid, text, text, integer, integer, integer, text, text, boolean, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.ads_record_google_ads_validation_e2(uuid, uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.ads_begin_google_ads_publish_e2(uuid, uuid, uuid, integer, uuid, text, integer, integer, bigint, smallint) from public, anon, authenticated;
revoke all on function public.ads_finalize_google_ads_publish_e2(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.ads_release_google_ads_publish_e2(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.ads_resolve_google_ads_publish(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.ads_reserve_google_api_operation_v2(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.ads_begin_google_ads_campaign_action_e2(uuid, uuid, uuid, text, integer, text, jsonb, jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function public.ads_finish_google_ads_campaign_action_e2(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.ads_plans_guard_version_and_approval() to service_role;
grant execute on function public.ads_actions_guard() to service_role;
grant execute on function public.ads_begin_google_ads_publish(uuid, uuid, uuid, integer, integer, bigint, smallint) to service_role;
grant execute on function public.ads_reconcile_stale_google_ads_publishes(integer) to service_role;
grant execute on function public.ads_charge_credits(uuid, integer, text) to service_role;
grant execute on function public.ads_create_google_ads_plan_draft_e2(uuid, uuid, jsonb, text, text, text, integer, integer, text) to service_role;
grant execute on function public.ads_approve_google_ads_plan_e2(uuid, uuid, integer, uuid, text, text, integer, integer, integer, text, text, boolean, boolean, jsonb) to service_role;
grant execute on function public.ads_record_google_ads_validation_e2(uuid, uuid, integer, uuid, text) to service_role;
grant execute on function public.ads_begin_google_ads_publish_e2(uuid, uuid, uuid, integer, uuid, text, integer, integer, bigint, smallint) to service_role;
grant execute on function public.ads_finalize_google_ads_publish_e2(uuid, uuid, uuid, text, boolean) to service_role;
grant execute on function public.ads_release_google_ads_publish_e2(uuid, uuid, uuid, text) to service_role;
grant execute on function public.ads_resolve_google_ads_publish(uuid, uuid, text, text, text) to service_role;
grant execute on function public.ads_reserve_google_api_operation_v2(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function public.ads_begin_google_ads_campaign_action_e2(uuid, uuid, uuid, text, integer, text, jsonb, jsonb, integer, boolean) to service_role;
grant execute on function public.ads_finish_google_ads_campaign_action_e2(uuid, uuid, text, jsonb, text) to service_role;

commit;

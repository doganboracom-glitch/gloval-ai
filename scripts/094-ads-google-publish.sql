-- UNAPPLIED DRAFT — E1 review only.
-- Do not run until reviewed and approved; explicit user approval is required.
-- Adds a transaction-backed publish reservation and counts each Google Ads
-- mutate operation against the existing per-user and project API quotas.

begin;

-- Campaign creation is a separate lifecycle from pausing/resuming the Google
-- Ads campaign. The external campaign is created PAUSED; these fields preserve
-- the publish reservation and billing-verification result for later UI work.
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

-- Recovery state stays on ads_plans; ads_purge_expired does not delete plans/actions.
-- No new recovery table is introduced, so there is no cascading retention purge.
create or replace function public.ads_plans_guard_version_and_approval()
returns trigger
language plpgsql
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
    new.publish_request_id := null;
    new.publish_started_at := null;
    new.publish_billing_verified := null;
    new.external_campaign_id := null;
    new.published_at := null;
    new.google_campaign_status := 'PAUSED';
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

-- One row records an HTTP request, while operation_count records each
-- GoogleAdsService.Mutate operation in that request. Existing rows default to 1.
alter table public.ads_google_api_operations
  add column if not exists operation_count integer not null default 1;

alter table public.ads_google_api_operations
  drop constraint if exists ads_google_api_operations_operation_count_check;
alter table public.ads_google_api_operations
  add constraint ads_google_api_operations_operation_count_check
  check (operation_count between 1 and 100);

alter table public.ads_google_api_operations
  drop constraint if exists ads_google_api_operations_method_check;
alter table public.ads_google_api_operations
  add constraint ads_google_api_operations_method_check
  check (method in (
    'customers.listAccessibleCustomers',
    'googleAds.search',
    'googleAds.searchStream',
    'googleAds.mutate'
  ));

create index if not exists ads_google_api_operations_user_method_created_idx
  on public.ads_google_api_operations (user_id, method, created_at);

-- Separate read and write budgets at both user and project level. Reads get
-- 80/user and 1,200/project; mutations get 40/user and 1,200/project, preserving
-- the 2,400 total ceiling while reserving half of it for publish/go-live work.
create or replace function public.ads_reserve_google_api_operation(
  p_request_id uuid,
  p_user_id uuid,
  p_connection_id uuid,
  p_method text
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
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'request and user ids are required';
  end if;
  if p_method is null or p_method not in (
    'customers.listAccessibleCustomers',
    'googleAds.search',
    'googleAds.searchStream'
  ) then
    raise exception 'unsupported Google Ads API method';
  end if;
  if p_connection_id is not null and not exists (
    select 1
    from public.ads_connections c
    where c.id = p_connection_id
      and c.user_id = p_user_id
      and c.platform = 'google_ads'
      and c.status = 'active'
  ) then
    raise exception 'Google Ads connection does not belong to user';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('gloval-google-ads-project-quota')::bigint
  );

  delete from public.ads_google_api_operations
  where created_at < v_now - interval '25 hours';

  select coalesce(sum(o.operation_count), 0)::integer
  into v_global_used
  from public.ads_google_api_operations o
  where o.created_at >= v_now - interval '24 hours';

  select coalesce(sum(o.operation_count), 0)::integer
  into v_global_bucket_used
  from public.ads_google_api_operations o
  where o.method <> 'googleAds.mutate'
    and o.created_at >= v_now - interval '24 hours';

  select coalesce(sum(o.operation_count), 0)::integer
  into v_user_used
  from public.ads_google_api_operations o
  where o.user_id = p_user_id
    and o.method <> 'googleAds.mutate'
    and o.created_at >= v_now - interval '24 hours';

  if v_global_used + 1 > 2400 or v_global_bucket_used + 1 > 1200 or v_user_used + 1 > 80 then
    return query select false, v_global_used, v_user_used;
    return;
  end if;

  insert into public.ads_google_api_operations (request_id, user_id, connection_id, method, operation_count)
  values (p_request_id, p_user_id, p_connection_id, p_method, 1);

  return query select true, v_global_used + 1, v_user_used + 1;
end;
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
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'request and user ids are required';
  end if;
  if p_method is distinct from 'googleAds.mutate' then
    raise exception 'unsupported Google Ads mutate method';
  end if;
  if p_operation_count is null or p_operation_count not between 1 and 100 then
    raise exception 'Google Ads mutate operation count is out of range';
  end if;
  if p_connection_id is null or not exists (
    select 1
    from public.ads_connections c
    where c.id = p_connection_id
      and c.user_id = p_user_id
      and c.platform = 'google_ads'
      and c.status = 'active'
  ) then
    raise exception 'Google Ads connection does not belong to user';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('gloval-google-ads-project-quota')::bigint
  );

  delete from public.ads_google_api_operations
  where created_at < v_now - interval '25 hours';

  select coalesce(sum(o.operation_count), 0)::integer
  into v_global_used
  from public.ads_google_api_operations o
  where o.created_at >= v_now - interval '24 hours';

  select coalesce(sum(o.operation_count), 0)::integer
  into v_global_bucket_used
  from public.ads_google_api_operations o
  where o.method = 'googleAds.mutate'
    and o.created_at >= v_now - interval '24 hours';

  select coalesce(sum(o.operation_count), 0)::integer
  into v_user_used
  from public.ads_google_api_operations o
  where o.user_id = p_user_id
    and o.method = 'googleAds.mutate'
    and o.created_at >= v_now - interval '24 hours';

  if v_global_used + p_operation_count > 2400
    or v_global_bucket_used + p_operation_count > 1200
    or v_user_used + p_operation_count > 40 then
    return query select false, v_global_used, v_user_used;
    return;
  end if;

  insert into public.ads_google_api_operations (request_id, user_id, connection_id, method, operation_count)
  values (p_request_id, p_user_id, p_connection_id, p_method, p_operation_count);

  return query select true, v_global_used + p_operation_count, v_user_used + p_operation_count;
end;
$$;

-- Atomically verify the exact approved version, store its server-generated
-- CPC summary, charge 15 credits, and claim the plan before any create request.
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

  select p.*
  into v_plan
  from public.ads_plans p
  where p.id = p_plan_id
    and p.user_id = p_user_id
  for update;

  if not found then
    return query select 'not_found'::text, 0, false, 0;
    return;
  end if;
  if p_expected_version is null
    or v_plan.version is distinct from p_expected_version
    or v_plan.approved_version is distinct from p_expected_version then
    return query select 'plan_changed'::text, 0, false, 0;
    return;
  end if;
  if v_plan.status = 'published' and v_plan.external_campaign_id is not null then
    return query select 'already_published'::text, 0, false, 0;
    return;
  end if;
  if v_plan.status in ('publishing', 'reconciling') then
    return query select 'in_progress'::text, 0, false, 0;
    return;
  end if;
  if v_plan.status <> 'approved'
    or v_plan.connection_id is null
    or v_plan.daily_budget_minor is null
    or v_plan.budget_cap_minor is null
    or v_plan.daily_budget_minor > v_plan.budget_cap_minor
    or p_currency_fraction_digits is null
    or p_currency_fraction_digits not between 0 and 6
    or p_cpc_bid_ceiling_minor is null
    or p_cpc_bid_ceiling_micros is null then
    return query select 'invalid_state'::text, 0, false, 0;
    return;
  end if;

  if exists (
    select 1
    from public.ads_connections c
    where c.id = v_plan.connection_id
      and c.user_id = p_user_id
      and c.status = 'active'
      and c.currency_code is distinct from v_plan.currency
  ) then
    return query select 'currency_mismatch'::text, 0, false, 0;
    return;
  end if;

  if not exists (
    select 1
    from public.ads_connections c
    where c.id = v_plan.connection_id
      and c.user_id = p_user_id
      and c.platform = 'google_ads'
      and c.status = 'active'
      and not c.is_manager
  ) then
    return query select 'invalid_state'::text, 0, false, 0;
    return;
  end if;

  v_one_unit_minor := pg_catalog.power(10, p_currency_fraction_digits)::integer;
  if v_plan.daily_budget_minor < v_one_unit_minor then
    return query select 'invalid_state'::text, 0, false, 0;
    return;
  end if;
  v_expected_cpc_minor := least(
    v_plan.daily_budget_minor,
    greatest(v_one_unit_minor, pg_catalog.floor(v_plan.daily_budget_minor / 10.0)::integer)
  );
  v_expected_cpc_micros := v_expected_cpc_minor::bigint
    * pg_catalog.power(10, 6 - p_currency_fraction_digits)::bigint;
  if p_cpc_bid_ceiling_minor is distinct from v_expected_cpc_minor
    or p_cpc_bid_ceiling_micros is distinct from v_expected_cpc_micros then
    return query select 'invalid_state'::text, 0, false, 0;
    return;
  end if;

  select *
  into v_charge
  from public.ads_charge_credits(
    p_user_id,
    15,
    'ads:publish:' || p_request_id::text
  );

  if not v_charge.ok then
    return query select 'insufficient_credits'::text, v_charge.balance, false, 0;
    return;
  end if;

  update public.ads_plans
  set status = 'publishing',
      publish_request_id = p_request_id,
      publish_started_at = pg_catalog.clock_timestamp(),
      publish_billing_verified = null,
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
  where id = p_plan_id
    and user_id = p_user_id;

  return query select 'started'::text, v_charge.balance, v_charge.already_charged, v_charge.charged_amount;
end;
$$;

-- Admin-only reconciliation finalizer. Invoke only through a server route that
-- authenticates an ADMIN_EMAILS member; EXECUTE is granted to service_role only.
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
  v_refund record;
  v_state text;
  v_refunded boolean := false;
  v_balance integer := 0;
begin
  if p_plan_id is null or p_request_id is null then
    raise exception 'plan and request ids are required';
  end if;
  if p_resolution is null or p_resolution not in ('published', 'failed_refunded') then
    return query select 'invalid_resolution'::text, false, 0;
    return;
  end if;
  if p_admin_email is null or p_admin_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    return query select 'admin_required'::text, false, 0;
    return;
  end if;

  select p.*
  into v_plan
  from public.ads_plans p
  where p.id = p_plan_id
    and p.publish_request_id = p_request_id
    and p.status = 'reconciling'
  for update;

  if not found then
    return query select 'not_reconciling'::text, false, 0;
    return;
  end if;

  if p_resolution = 'published' then
    if p_external_campaign_id is null or p_external_campaign_id !~ '^\d{1,20}$'
      or v_plan.connection_id is null then
      return query select 'campaign_id_required'::text, false, 0;
      return;
    end if;

    update public.ads_plans
    set status = 'published',
        external_campaign_id = p_external_campaign_id,
        published_at = pg_catalog.clock_timestamp(),
        google_campaign_status = 'PAUSED',
        failure_reason = null
    where id = v_plan.id;
    v_state := 'resolved_published';
  else
    if p_external_campaign_id is not null then
      return query select 'unexpected_campaign_id'::text, false, 0;
      return;
    end if;
    select *
    into v_refund
    from public.ads_refund_credits(
      v_plan.user_id,
      'ads:publish:' || v_plan.publish_request_id::text
    );
    if not v_refund.refunded then
      return query select 'refund_unavailable'::text, false, v_refund.balance;
      return;
    end if;

    update public.ads_plans
    set status = 'failed',
        failure_reason = 'admin_confirmed_campaign_not_created',
        external_campaign_id = null,
        published_at = null,
        google_campaign_status = 'PAUSED'
    where id = v_plan.id;
    v_state := 'resolved_failed';
    v_refunded := true;
    v_balance := v_refund.balance;
  end if;

  insert into public.ads_actions
    (user_id, plan_id, connection_id, actor, action_type, before_state, after_state, status, applied_at)
  values
  (v_plan.user_id, v_plan.id, v_plan.connection_id, 'system',
   'publish_reconciliation_resolved',
   pg_catalog.jsonb_build_object('status', 'reconciling', 'request_id', p_request_id),
   pg_catalog.jsonb_build_object('status', v_state, 'external_campaign_id', p_external_campaign_id, 'admin_email', p_admin_email),

     'applied', pg_catalog.clock_timestamp());

  return query select v_state, v_refunded, v_balance;
end;
$$;

revoke all on function public.ads_reserve_google_api_operation(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.ads_reserve_google_api_operation(uuid, uuid, uuid, text)
  to service_role;

revoke all on function public.ads_reserve_google_api_operation_v2(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.ads_reserve_google_api_operation_v2(uuid, uuid, uuid, text, integer)
  to service_role;

revoke all on function public.ads_begin_google_ads_publish(uuid, uuid, uuid, integer, integer, bigint, smallint)
  from public, anon, authenticated;
grant execute on function public.ads_begin_google_ads_publish(uuid, uuid, uuid, integer, integer, bigint, smallint)
  to service_role;

revoke all on function public.ads_resolve_google_ads_publish(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.ads_resolve_google_ads_publish(uuid, uuid, text, text, text)
  to service_role;

commit;

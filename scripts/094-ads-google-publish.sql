-- UNAPPLIED DRAFT — E1 review only.
-- Do not run or apply without explicit user approval.
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
  add column if not exists publish_request_id uuid,
  add column if not exists publish_started_at timestamptz,
  add column if not exists publish_billing_verified boolean,
  add column if not exists google_campaign_status text not null default 'PAUSED';

alter table public.ads_plans
  drop constraint if exists ads_plans_google_campaign_status_check;
alter table public.ads_plans
  add constraint ads_plans_google_campaign_status_check
  check (google_campaign_status in ('PAUSED', 'ENABLED'));

create unique index if not exists ads_plans_publish_request_uniq
  on public.ads_plans (publish_request_id)
  where publish_request_id is not null;

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

-- Keep the existing read-only RPC signature compatible while making its quota
-- calculation include the individual operations in prior mutate requests.
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
  into v_user_used
  from public.ads_google_api_operations o
  where o.user_id = p_user_id
    and o.created_at >= v_now - interval '24 hours';

  if v_global_used + 1 > 2400 or v_user_used + 1 > 120 then
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
  into v_user_used
  from public.ads_google_api_operations o
  where o.user_id = p_user_id
    and o.created_at >= v_now - interval '24 hours';

  if v_global_used + p_operation_count > 2400 or v_user_used + p_operation_count > 120 then
    return query select false, v_global_used, v_user_used;
    return;
  end if;

  insert into public.ads_google_api_operations (request_id, user_id, connection_id, method, operation_count)
  values (p_request_id, p_user_id, p_connection_id, p_method, p_operation_count);

  return query select true, v_global_used + p_operation_count, v_user_used + p_operation_count;
end;
$$;

-- Atomically lock an approved plan, charge exactly 15 credits, and set its
-- publishing state before any external create request is sent.
create or replace function public.ads_begin_google_ads_publish(
  p_user_id uuid,
  p_plan_id uuid,
  p_request_id uuid
)
returns table(state text, balance integer, already_charged boolean, charged_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
  v_charge record;
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
    or v_plan.daily_budget_minor > v_plan.budget_cap_minor then
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
      google_campaign_status = 'PAUSED',
      failure_reason = null
  where id = p_plan_id
    and user_id = p_user_id;

  return query select 'started'::text, v_charge.balance, v_charge.already_charged, v_charge.charged_amount;
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

revoke all on function public.ads_begin_google_ads_publish(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.ads_begin_google_ads_publish(uuid, uuid, uuid)
  to service_role;

commit;

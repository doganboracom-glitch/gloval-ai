-- DRAFT ONLY: review and apply explicitly through the Supabase MCP. This file has
-- not been run against the live database. Runtime code calls the v2 RPCs below.

BEGIN;

-- A missing sanity ceiling means unlimited. The stored approval ceiling must be
-- nullable so existing approval/publish workflows can persist that decision.
alter table public.ads_google_publish_approvals
  alter column user_daily_budget_limit_minor drop not null;

alter table public.ads_plans
  alter column approval_user_daily_budget_limit_minor drop not null;

create or replace function public.ads_approve_google_ads_plan_v2(
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
begin
  if p_user_id is null or p_plan_id is null or p_connection_id is null then
    raise exception 'user, plan, and connection are required';
  end if;
  if p_plan_hash is null or p_plan_hash !~ '^[0-9a-f]{64}$'
    or p_expected_version is null or p_expected_version < 1 then
    return query select 'invalid_approval'::text, null::uuid, null::integer; return;
  end if;
  if p_eu_political_advertising not in ('yes', 'no')
    or p_eu_declaration_confirmed is distinct from true
    or p_terms_accepted is distinct from true then
    return query select 'confirmation_required'::text, null::uuid, null::integer; return;
  end if;
  if p_daily_budget_minor is null or p_daily_budget_minor <= 0
    or p_budget_cap_minor is null or p_budget_cap_minor < p_daily_budget_minor
    or (p_user_daily_budget_limit_minor is not null and p_user_daily_budget_limit_minor < p_daily_budget_minor)
    or p_currency is null or p_currency not in ('TRY', 'USD', 'EUR')
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

  select a.* into v_approval from public.ads_google_publish_approvals a
   where a.plan_id = p_plan_id and a.plan_version = p_expected_version for update;
  if found then
    if v_approval.plan_hash is distinct from p_plan_hash
      or v_approval.eu_political_advertising is distinct from p_eu_political_advertising
      or v_approval.user_daily_budget_limit_minor is distinct from p_user_daily_budget_limit_minor then
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

create or replace function public.ads_begin_google_ads_publish_v2(
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
    or (p_user_daily_budget_limit_minor is not null and v_plan.daily_budget_minor > p_user_daily_budget_limit_minor) then
    return query select 'budget_limit_exceeded'::text, 0, false, 0; return;
  end if;
  if v_plan.currency not in ('TRY', 'USD', 'EUR') then
    return query select 'currency_mismatch'::text, 0, false, 0; return;
  end if;

  v_currency_digits := 2;
  if p_currency_fraction_digits is distinct from v_currency_digits
    or p_currency_fraction_digits is null then
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

create or replace function public.ads_begin_google_ads_campaign_action_v2(
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
begin
  if p_user_id is null or p_plan_id is null or p_action_id is null then
    raise exception 'user, plan, and action ids are required';
  end if;
  if p_user_confirmed is distinct from true then
    return query select 'confirmation_required'::text, null::uuid; return;
  end if;
  if p_action_type not in ('google_ads_campaign_status_update', 'google_ads_budget_update', 'google_ads_ad_copy_update')
    or p_approval_hash is null or p_approval_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid_action'::text, null::uuid; return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text || ':' || coalesce((select p.currency from public.ads_plans p where p.id = p_plan_id and p.user_id = p_user_id), ''))
  );
  select p.* into v_plan from public.ads_plans p
   where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then return query select 'not_found'::text, null::uuid; return; end if;
  if v_plan.status is distinct from 'published' or v_plan.external_campaign_id is null
    or v_plan.version is distinct from p_expected_version or v_plan.approved_version is distinct from p_expected_version then
    return query select 'plan_changed'::text, null::uuid; return;
  end if;
  select a.* into v_action from public.ads_actions a
   where a.user_id = p_user_id and a.idempotency_key = p_action_id for update;
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
    if v_target_budget is null or v_target_budget <= 0
      or (p_user_daily_budget_limit_minor is not null and v_target_budget > p_user_daily_budget_limit_minor) then
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

create or replace function public.ads_finish_google_ads_campaign_action_v2(
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
      update public.ads_plans p set google_daily_budget_minor = v_budget
       where p.id = v_plan.id and p.user_id = p_user_id;
    elsif v_action.action_type = 'google_ads_campaign_status_update' then
      v_status := v_action.target->>'status';
      if v_status not in ('PAUSED', 'ENABLED') then return query select 'invalid_status'::text; return; end if;
      update public.ads_plans p set google_campaign_status = v_status
       where p.id = v_plan.id and p.user_id = p_user_id;
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

create or replace function public.ads_reserve_google_ads_publish_capacity_v2(
  p_user_id uuid,
  p_plan_id uuid,
  p_connection_id uuid,
  p_request_id uuid,
  p_daily_attempts_per_user integer,
  p_daily_attempts_global integer
)
returns table(state text, action_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
  v_existing public.ads_actions%rowtype;
  v_action_id uuid;
  v_user_attempts bigint;
  v_global_attempts bigint;
  v_denial text;
begin
  if p_user_id is null or p_plan_id is null or p_connection_id is null or p_request_id is null
    or (p_daily_attempts_per_user is not null and p_daily_attempts_per_user <= 0)
    or (p_daily_attempts_global is not null and p_daily_attempts_global <= 0) then
    return query select 'invalid_request'::text, null::uuid; return;
  end if;

  if p_daily_attempts_global is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('google-ads-publish-global-v2'));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('google-ads-publish-user-v2:' || p_user_id::text));

  select a.* into v_existing from public.ads_actions a
   where a.user_id = p_user_id and a.action_type = 'google_ads_publish_attempt_reserved_v2'
     and a.idempotency_key = p_request_id for update;
  if found then
    if v_existing.plan_id is distinct from p_plan_id or v_existing.connection_id is distinct from p_connection_id then
      return query select 'idempotency_conflict'::text, null::uuid; return;
    end if;
    return query select 'reserved'::text, v_existing.id; return;
  end if;

  select p.* into v_plan from public.ads_plans p
   where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found or v_plan.connection_id is distinct from p_connection_id
    or v_plan.status is distinct from 'approved' or v_plan.external_campaign_id is not null then
    return query select 'plan_not_ready'::text, null::uuid; return;
  end if;

  select count(*) into v_user_attempts from public.ads_actions a
   where a.user_id = p_user_id and a.action_type = 'google_ads_publish_attempt_reserved_v2'
     and a.created_at >= now() - interval '24 hours';
  if p_daily_attempts_per_user is not null and v_user_attempts >= p_daily_attempts_per_user then
    v_denial := 'user_publish_limit_reached';
  end if;

  if v_denial is null and p_daily_attempts_global is not null then
    select count(*) into v_global_attempts from public.ads_actions a
     where a.action_type = 'google_ads_publish_attempt_reserved_v2'
       and a.created_at >= now() - interval '24 hours';
    if v_global_attempts >= p_daily_attempts_global then
      v_denial := 'global_publish_limit_reached';
    end if;
  end if;

  if v_denial is not null then
    insert into public.ads_actions (
      user_id, plan_id, connection_id, actor, action_type, target, before_state,
      reversible, status, idempotency_key, expected_version, failure_reason, applied_at
    ) values (
      p_user_id, p_plan_id, p_connection_id, 'system', 'google_ads_policy_blocked',
      jsonb_build_object('operation', 'publish_attempt_quota'), '{}'::jsonb,
      false, 'failed', p_request_id, v_plan.version, v_denial, now()
    );
    return query select v_denial, null::uuid; return;
  end if;

  insert into public.ads_actions (
    user_id, plan_id, connection_id, actor, action_type, target, before_state,
    reversible, status, idempotency_key, expected_version
  ) values (
    p_user_id, p_plan_id, p_connection_id, 'system', 'google_ads_publish_attempt_reserved_v2',
    jsonb_build_object('requestId', p_request_id), '{}'::jsonb,
    false, 'proposed', p_request_id, v_plan.version
  ) returning id into v_action_id;
  return query select 'reserved'::text, v_action_id;
end
$$;

create or replace function public.ads_finish_google_ads_publish_capacity_v2(
  p_user_id uuid,
  p_action_id uuid,
  p_outcome text,
  p_reason_code text
)
returns table(state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.ads_actions%rowtype;
begin
  if p_user_id is null or p_action_id is null or p_outcome not in ('success', 'failure') then
    return query select 'invalid_request'::text; return;
  end if;
  select a.* into v_action from public.ads_actions a
   where a.id = p_action_id and a.user_id = p_user_id
     and a.action_type = 'google_ads_publish_attempt_reserved_v2' for update;
  if not found then return query select 'not_found'::text; return; end if;
  if v_action.status in ('applied', 'failed') then
    return query select v_action.status::text; return;
  end if;
  if v_action.status is distinct from 'proposed' then
    return query select 'action_not_pending'::text; return;
  end if;

  update public.ads_actions a set
    status = case when p_outcome = 'success' then 'applied' else 'failed' end,
    after_state = jsonb_build_object('outcome', p_outcome, 'reason_code', p_reason_code),
    failure_reason = case when p_outcome = 'failure' then coalesce(p_reason_code, 'publish_failed') else null end,
    applied_at = case when p_outcome = 'success' then now() else null end
   where a.id = p_action_id and a.user_id = p_user_id;
  return query select case when p_outcome = 'success' then 'applied' else 'failed' end;
end
$$;

revoke all on function public.ads_approve_google_ads_plan_v2(uuid, uuid, integer, uuid, text, text, integer, integer, integer, text, text, boolean, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.ads_begin_google_ads_publish_v2(uuid, uuid, uuid, integer, uuid, text, integer, integer, bigint, smallint) from public, anon, authenticated;
revoke all on function public.ads_begin_google_ads_campaign_action_v2(uuid, uuid, uuid, text, integer, text, jsonb, jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function public.ads_finish_google_ads_campaign_action_v2(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.ads_reserve_google_ads_publish_capacity_v2(uuid, uuid, uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.ads_finish_google_ads_publish_capacity_v2(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.ads_approve_google_ads_plan_v2(uuid, uuid, integer, uuid, text, text, integer, integer, integer, text, text, boolean, boolean, jsonb) to service_role;
grant execute on function public.ads_begin_google_ads_publish_v2(uuid, uuid, uuid, integer, uuid, text, integer, integer, bigint, smallint) to service_role;
grant execute on function public.ads_begin_google_ads_campaign_action_v2(uuid, uuid, uuid, text, integer, text, jsonb, jsonb, integer, boolean) to service_role;
grant execute on function public.ads_finish_google_ads_campaign_action_v2(uuid, uuid, text, jsonb, text) to service_role;
grant execute on function public.ads_reserve_google_ads_publish_capacity_v2(uuid, uuid, uuid, uuid, integer, integer) to service_role;
grant execute on function public.ads_finish_google_ads_publish_capacity_v2(uuid, uuid, text, text) to service_role;

COMMIT;

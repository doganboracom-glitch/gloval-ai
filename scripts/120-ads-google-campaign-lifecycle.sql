-- UNAPPLIED DRAFT — do not apply to live Supabase from this task.
-- The migration runner owns transaction boundaries; this file adds no BEGIN/COMMIT.

do $migration$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
      from pg_catalog.pg_constraint c
     where c.conrelid = 'public.ads_plans'::regclass
       and c.contype = 'c'
       and pg_catalog.pg_get_constraintdef(c.oid) ilike '%google_campaign_status%'
  loop
    execute pg_catalog.format('alter table public.ads_plans drop constraint %I', v_constraint.conname);
  end loop;
end
$migration$;

alter table public.ads_plans
  add constraint ads_plans_google_campaign_status_check
  check (google_campaign_status in ('PAUSED', 'ENABLED', 'REMOVED', 'UNKNOWN'));

drop index if exists public.ads_actions_one_undo_uniq;
create unique index if not exists ads_actions_one_active_undo_uniq
  on public.ads_actions (undone_of)
  where undone_of is not null and status in ('approved', 'applied');

create index if not exists ads_actions_google_management_history_idx
  on public.ads_actions (user_id, plan_id, created_at desc)
  where action_type in (
    'google_ads_campaign_status_update',
    'google_ads_budget_update',
    'google_ads_ad_copy_update',
    'google_ads_keyword_update',
    'google_ads_campaign_archive'
  );

alter table public.ads_google_publish_approvals
  alter column user_daily_budget_limit_minor drop not null;
alter table public.ads_google_publish_approvals
  drop constraint if exists ads_google_publish_approvals_user_daily_budget_limit_minor_check;
alter table public.ads_google_publish_approvals
  add constraint ads_google_publish_approvals_user_daily_budget_limit_minor_check
  check (user_daily_budget_limit_minor is null or user_daily_budget_limit_minor >= daily_budget_minor);

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
    or p_currency is null or p_currency !~ '^[A-Z]{3}$'
    or p_customer_id is null or p_customer_id !~ '^[0-9-]{1,32}$' then
    return query select 'invalid_budget'::text, null::uuid, null::integer; return;
  end if;
  if p_user_daily_budget_limit_minor is not null
    and p_daily_budget_minor > p_user_daily_budget_limit_minor then
    return query select 'budget_sanity_ceiling_exceeded'::text, null::uuid, null::integer; return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text || ':' || p_currency));
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
    or v_plan.daily_budget_minor <= 0 or v_plan.daily_budget_minor > v_plan.budget_cap_minor then
    return query select 'invalid_budget'::text, 0, false, 0; return;
  end if;
  if p_user_daily_budget_limit_minor is not null and v_plan.daily_budget_minor > p_user_daily_budget_limit_minor then
    return query select 'budget_sanity_ceiling_exceeded'::text, 0, false, 0; return;
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

create or replace function public.ads_begin_google_ads_management_action_v4(
  p_user_id uuid,
  p_plan_id uuid,
  p_action_id uuid,
  p_action_type text,
  p_expected_version integer,
  p_approval_hash text,
  p_target jsonb,
  p_before_state jsonb,
  p_user_daily_budget_limit_minor integer,
  p_risk_confirmation_required boolean,
  p_risk_confirmed_amount_minor integer,
  p_user_confirmed boolean,
  p_undo_of uuid default null
)
returns table(state text, action_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_plans%rowtype;
  v_action public.ads_actions%rowtype;
  v_original public.ads_actions%rowtype;
  v_target_budget integer;
  v_current_micros numeric;
  v_target_micros numeric;
begin
  if p_user_id is null or p_plan_id is null or p_action_id is null then
    raise exception 'user, plan, and action ids are required';
  end if;
  if p_user_confirmed is distinct from true then
    return query select 'confirmation_required'::text, null::uuid; return;
  end if;
  if p_action_type not in (
      'google_ads_campaign_status_update',
      'google_ads_budget_update',
      'google_ads_ad_copy_update',
      'google_ads_keyword_update',
      'google_ads_campaign_archive'
    )
    or p_approval_hash is null or p_approval_hash !~ '^[0-9a-f]{64}$'
    or p_target is null or jsonb_typeof(p_target) is distinct from 'object'
    or p_before_state is null or jsonb_typeof(p_before_state) is distinct from 'object'
    or p_risk_confirmation_required is null then
    return query select 'invalid_action'::text, null::uuid; return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text || ':' || coalesce((
      select p.currency from public.ads_plans p where p.id = p_plan_id and p.user_id = p_user_id
    ), ''))
  );
  select p.* into v_plan
    from public.ads_plans p
   where p.id = p_plan_id and p.user_id = p_user_id
   for update;
  if not found then return query select 'not_found'::text, null::uuid; return; end if;
  if v_plan.status is distinct from 'published' or v_plan.external_campaign_id is null
     or v_plan.version is distinct from p_expected_version
     or v_plan.approved_version is distinct from p_expected_version then
    return query select 'plan_changed'::text, null::uuid; return;
  end if;

  select a.* into v_action
    from public.ads_actions a
   where a.user_id = p_user_id and a.idempotency_key = p_action_id
   for update;
  if found then
    if v_action.plan_id is distinct from p_plan_id
       or v_action.action_type is distinct from p_action_type
       or v_action.approval_hash is distinct from p_approval_hash
       or v_action.undone_of is distinct from p_undo_of then
      return query select 'idempotency_conflict'::text, null::uuid; return;
    end if;
    return query select 'existing'::text, v_action.id; return;
  end if;

  if p_undo_of is not null then
    select a.* into v_original
      from public.ads_actions a
     where a.id = p_undo_of and a.user_id = p_user_id and a.plan_id = p_plan_id
     for update;
    if not found or v_original.status is distinct from 'applied'
       or v_original.reversible is distinct from true
       or v_original.after_state is null
       or v_original.action_type is distinct from p_action_type
  or exists (
    select 1 from public.ads_actions a
    where a.undone_of = p_undo_of and a.status in ('approved', 'applied')
  ) then
    return query select 'action_not_reversible'::text, null::uuid; return;

    end if;
  end if;

  if exists (
    select 1 from public.ads_actions a
     where a.plan_id = p_plan_id and a.user_id = p_user_id
       and a.status = 'approved'
       and a.action_type in (
         'google_ads_campaign_status_update',
         'google_ads_budget_update',
         'google_ads_ad_copy_update',
         'google_ads_keyword_update',
         'google_ads_campaign_archive'
       )
  ) then
    return query select 'action_in_progress'::text, null::uuid; return;
  end if;

  if p_action_type = 'google_ads_campaign_status_update'
     and p_target->>'status' not in ('PAUSED', 'ENABLED') then
    return query select 'invalid_status'::text, null::uuid; return;
  end if;

  if p_action_type = 'google_ads_campaign_archive'
     and (v_plan.google_campaign_status is distinct from 'PAUSED'
       or p_before_state->>'campaignStatus' is distinct from 'PAUSED') then
    return query select 'pause_before_archive'::text, null::uuid; return;
  end if;

  if p_action_type = 'google_ads_ad_copy_update' then
    if jsonb_typeof(p_target->'headlines') is distinct from 'array'
       or jsonb_array_length(p_target->'headlines') not between 3 and 15
       or jsonb_typeof(p_target->'descriptions') is distinct from 'array'
       or jsonb_array_length(p_target->'descriptions') not between 2 and 4 then
      return query select 'invalid_action'::text, null::uuid; return;
    end if;
  end if;

  if p_action_type = 'google_ads_keyword_update' then
    if p_target->>'keywordOperation' not in ('add', 'remove') then
      return query select 'invalid_action'::text, null::uuid; return;
    end if;
    if p_target->>'keywordOperation' = 'add' and (
      length(btrim(coalesce(p_target->>'keywordText', ''))) not between 1 and 80
      or p_target->>'keywordMatchType' not in ('EXACT', 'PHRASE')
      or jsonb_typeof(p_target->'keywordNegative') is distinct from 'boolean'
      or p_target->>'adGroupResourceName' !~ '^customers/[0-9]{1,20}/adGroups/[0-9]{1,20}$'
    ) then
      return query select 'invalid_action'::text, null::uuid; return;
    end if;
    if p_target->>'keywordOperation' = 'remove'
       and p_target->>'keywordResourceName' !~ '^customers/[0-9]{1,20}/adGroupCriteria/[0-9]{1,20}~[0-9]{1,20}$' then
      return query select 'invalid_action'::text, null::uuid; return;
    end if;
  end if;

  if p_risk_confirmation_required then
    if p_risk_confirmed_amount_minor is null then
      return query select 'risk_confirmation_required'::text, null::uuid; return;
    end if;
    if p_target->>'riskConfirmedAmountMinor' is distinct from p_risk_confirmed_amount_minor::text then
      return query select 'risk_confirmation_mismatch'::text, null::uuid; return;
    end if;
  elsif p_risk_confirmed_amount_minor is not null or p_target ? 'riskConfirmedAmountMinor' then
    return query select 'risk_confirmation_mismatch'::text, null::uuid; return;
  end if;

  if p_action_type = 'google_ads_budget_update' then
    if (p_target->>'dailyBudgetMinor') !~ '^[0-9]{1,9}$'
       or (p_target->>'dailyBudgetMicros') !~ '^[0-9]{1,20}$'
       or v_plan.budget_cap_minor is null then
      return query select 'invalid_budget'::text, null::uuid; return;
    end if;
    v_target_budget := (p_target->>'dailyBudgetMinor')::integer;
    v_target_micros := (p_target->>'dailyBudgetMicros')::numeric;
    v_current_micros := nullif(p_before_state->>'dailyBudgetMicros', '')::numeric;
    if v_target_budget <= 0 or v_current_micros is null or v_current_micros <= 0 then
      return query select 'invalid_budget'::text, null::uuid; return;
    end if;
    if p_user_daily_budget_limit_minor is not null
       and v_target_budget > p_user_daily_budget_limit_minor then
      return query select 'budget_sanity_ceiling_exceeded'::text, null::uuid; return;
    end if;
    if v_target_budget > v_plan.budget_cap_minor
       and p_risk_confirmed_amount_minor is distinct from v_target_budget then
      return query select 'risk_confirmation_required'::text, null::uuid; return;
    end if;
  end if;

  insert into public.ads_actions (
    id, user_id, plan_id, connection_id, actor, action_type, target, before_state,
    reversible, status, idempotency_key, approval_hash, expected_version, undone_of
  ) values (
    p_action_id, p_user_id, p_plan_id, v_plan.connection_id, 'user', p_action_type,
    p_target, p_before_state, p_action_type <> 'google_ads_campaign_archive',
    'approved', p_action_id, p_approval_hash, p_expected_version, p_undo_of
  ) returning * into v_action;
  return query select 'approved'::text, v_action.id;
end
$$;

create or replace function public.ads_finish_google_ads_management_action_v4(
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
  v_original public.ads_actions%rowtype;
  v_budget integer;
  v_status text;
begin
  select a.* into v_action
    from public.ads_actions a
   where a.id = p_action_id and a.user_id = p_user_id
   for update;
  if not found then return query select 'not_found'::text; return; end if;
  if v_action.status = 'applied' then return query select 'applied'::text; return; end if;
  if v_action.status is distinct from 'approved' then return query select 'action_not_pending'::text; return; end if;
  if p_result not in ('applied', 'failed') then return query select 'invalid_result'::text; return; end if;

  if p_result = 'applied' then
    select p.* into v_plan
      from public.ads_plans p
     where p.id = v_action.plan_id and p.user_id = p_user_id and p.status = 'published'
     for update;
    if not found or v_plan.version is distinct from v_action.expected_version then
      return query select 'plan_changed'::text; return;
    end if;
    if v_action.action_type = 'google_ads_budget_update' then
      v_budget := (v_action.target->>'dailyBudgetMinor')::integer;
      if v_budget is null or v_budget <= 0 then
        return query select 'invalid_budget'::text; return;
      end if;
      if v_budget > v_plan.budget_cap_minor
         and (v_action.target->>'riskConfirmedAmountMinor') is distinct from v_budget::text then
        return query select 'risk_confirmation_required'::text; return;
      end if;
      update public.ads_plans p
         set google_daily_budget_minor = v_budget
       where p.id = v_plan.id and p.user_id = p_user_id;
    elsif v_action.action_type = 'google_ads_campaign_status_update' then
      v_status := v_action.target->>'status';
      if v_status not in ('PAUSED', 'ENABLED') then return query select 'invalid_status'::text; return; end if;
      update public.ads_plans p
         set google_campaign_status = v_status
       where p.id = v_plan.id and p.user_id = p_user_id;
    elsif v_action.action_type = 'google_ads_campaign_archive' then
      if v_plan.google_campaign_status is distinct from 'PAUSED'
         or v_action.target->>'campaignStatus' is distinct from 'REMOVED' then
        return query select 'pause_before_archive'::text; return;
      end if;
      update public.ads_plans p
         set google_campaign_status = 'REMOVED'
       where p.id = v_plan.id and p.user_id = p_user_id;
    end if;
  end if;

  update public.ads_actions a set
    status = p_result,
    after_state = case when p_result = 'applied' then p_after_state else null end,
    failure_reason = case
      when p_result = 'failed' then left(coalesce(p_failure_reason, 'provider_error'), 80)
      when p_result = 'applied' and p_after_state is null then 'state_unverified'
      else null
    end,
    applied_at = case when p_result = 'applied' then pg_catalog.clock_timestamp() else null end
   where a.id = p_action_id and a.user_id = p_user_id;
  return query select p_result::text;
end
$$;

drop function if exists public.ads_begin_google_ads_campaign_action_e2(uuid, uuid, uuid, text, integer, text, jsonb, jsonb, integer, boolean);
drop function if exists public.ads_finish_google_ads_campaign_action_e2(uuid, uuid, text, jsonb, text);
drop function if exists public.ads_begin_google_ads_management_action_v3(uuid, uuid, uuid, text, integer, text, jsonb, jsonb, integer, boolean, uuid);
drop function if exists public.ads_finish_google_ads_management_action_v3(uuid, uuid, text, jsonb, text);

revoke all on function public.ads_begin_google_ads_management_action_v4(uuid, uuid, uuid, text, integer, text, jsonb, jsonb, integer, boolean, integer, boolean, uuid) from public, anon, authenticated;
revoke all on function public.ads_finish_google_ads_management_action_v4(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.ads_begin_google_ads_management_action_v4(uuid, uuid, uuid, text, integer, text, jsonb, jsonb, integer, boolean, integer, boolean, uuid) to service_role;
grant execute on function public.ads_finish_google_ads_management_action_v4(uuid, uuid, text, jsonb, text) to service_role;

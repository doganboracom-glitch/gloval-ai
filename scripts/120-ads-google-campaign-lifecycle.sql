begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Google Ads campaign management lifecycle. Keep this migration unapplied until
-- it is reviewed and deployed alongside the application change.

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

create or replace function public.ads_begin_google_ads_management_action_v3(
  p_user_id uuid,
  p_plan_id uuid,
  p_action_id uuid,
  p_action_type text,
  p_expected_version integer,
  p_approval_hash text,
  p_target jsonb,
  p_before_state jsonb,
  p_user_daily_budget_limit_minor integer,
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
  v_used integer;
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
    or p_before_state is null or jsonb_typeof(p_before_state) is distinct from 'object' then
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

  if p_action_type = 'google_ads_budget_update' then
    if (p_target->>'dailyBudgetMinor') !~ '^[0-9]{1,9}$'
       or (p_target->>'dailyBudgetMicros') !~ '^[0-9]{1,20}$'
       or p_user_daily_budget_limit_minor is null
       or v_plan.budget_cap_minor is null then
      return query select 'invalid_budget'::text, null::uuid; return;
    end if;
    v_target_budget := (p_target->>'dailyBudgetMinor')::integer;
    v_target_micros := (p_target->>'dailyBudgetMicros')::numeric;
    v_current_micros := nullif(p_before_state->>'dailyBudgetMicros', '')::numeric;
    if v_target_budget <= 0 or v_target_budget > v_plan.budget_cap_minor
       or v_current_micros is null or v_current_micros <= 0 then
      return query select 'invalid_budget'::text, null::uuid; return;
    end if;
    if v_target_micros > v_current_micros then
      if v_target_micros * 4 > v_current_micros * 5 then
        return query select 'budget_increase_limit_exceeded'::text, null::uuid; return;
      end if;
      if exists (
        select 1
          from public.ads_actions a
         where a.user_id = p_user_id and a.plan_id = p_plan_id
           and a.action_type = 'google_ads_budget_update' and a.status = 'applied'
           and a.applied_at > pg_catalog.clock_timestamp() - interval '1 hour'
           and (a.target->>'dailyBudgetMicros') ~ '^[0-9]{1,20}$'
           and (a.before_state->>'dailyBudgetMicros') ~ '^[0-9]{1,20}$'
           and (a.target->>'dailyBudgetMicros')::numeric > (a.before_state->>'dailyBudgetMicros')::numeric
      ) then
        return query select 'budget_cooldown_active'::text, null::uuid; return;
      end if;
    end if;
    select coalesce(sum(coalesce(p.google_daily_budget_minor, p.daily_budget_minor, 0)), 0)::integer
      into v_used
      from public.ads_plans p
     where p.user_id = p_user_id and p.currency = v_plan.currency
       and p.status in ('approved', 'publishing', 'reconciling', 'published');
    if v_used - coalesce(v_plan.google_daily_budget_minor, v_plan.daily_budget_minor, 0)
       + v_target_budget > p_user_daily_budget_limit_minor then
      return query select 'budget_limit_exceeded'::text, null::uuid; return;
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

create or replace function public.ads_finish_google_ads_management_action_v3(
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
      if v_budget is null or v_budget <= 0 or v_budget > v_plan.budget_cap_minor then
        return query select 'invalid_budget'::text; return;
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

revoke all on function public.ads_begin_google_ads_management_action_v3(uuid, uuid, uuid, text, integer, text, jsonb, jsonb, integer, boolean, uuid) from public, anon, authenticated;
revoke all on function public.ads_finish_google_ads_management_action_v3(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.ads_begin_google_ads_management_action_v3(uuid, uuid, uuid, text, integer, text, jsonb, jsonb, integer, boolean, uuid) to service_role;
grant execute on function public.ads_finish_google_ads_management_action_v3(uuid, uuid, text, jsonb, text) to service_role;

commit;

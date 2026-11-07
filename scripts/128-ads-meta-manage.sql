-- UNAPPLIED DRAFT. Review and apply only through the approved migration workflow.
-- GLOVAL Ads / Meta (Facebook + Instagram), phase M3 = activate / pause / budget change + live status sync.
--
-- Run order: after 127. No begin/commit on purpose (apply step by step through the migration workflow).
-- Reuses ads_meta_plans (status list already contains active / user_paused / archived) and the append-only
-- ads_meta_actions log. Nothing here deletes Meta objects; "archive" stays out of scope.

-- (a) Live-state columns on the plan -----------------------------------------
alter table public.ads_meta_plans add column if not exists current_effective_status text
  check (current_effective_status is null or pg_catalog.length(current_effective_status) <= 40);
alter table public.ads_meta_plans add column if not exists last_synced_at timestamptz;
alter table public.ads_meta_plans add column if not exists live_snapshot jsonb
  check (live_snapshot is null or pg_catalog.jsonb_typeof(live_snapshot) = 'object');
alter table public.ads_meta_plans add column if not exists activated_at timestamptz;

-- (b) Graph operation counter: status reads + update writes --------------------
alter table public.ads_meta_api_operations drop constraint if exists ads_meta_api_operations_endpoint_check;
alter table public.ads_meta_api_operations
  add constraint ads_meta_api_operations_endpoint_check check (
    endpoint in (
      'me.adaccounts', 'me.accounts', 'act.account', 'act.instagram_accounts', 'act.insights', 'act.campaigns',
      'debug_token', 'oauth.token', 'me.permissions',
      'act.adsets', 'act.adcreatives', 'act.ads', 'act.adimages', 'act.funding',
      'act.campaigns.create', 'act.adsets.create', 'act.adimages.create', 'act.adcreatives.create', 'act.ads.create',
      'act.campaigns.validate', 'act.adsets.validate', 'act.adcreatives.validate', 'act.ads.validate',
      'act.insights.campaign', 'campaign.status', 'adset.status', 'ad.status',
      'act.campaigns.update', 'act.adsets.update', 'act.ads.update'
    )
  );

-- Writes now also include '.update' (separate write quota, same sliding 24 h window as 127).
create or replace function public.ads_reserve_meta_api_operation(
  p_request_id uuid,
  p_user_id uuid,
  p_connection_id uuid,
  p_endpoint text,
  p_user_daily_limit integer,
  p_global_daily_limit integer
)
returns table (allowed boolean, global_used integer, user_used integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_start timestamptz := pg_catalog.clock_timestamp() - interval '24 hours';
  v_is_write boolean;
  v_global_used integer;
  v_user_used integer;
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'request and user ids are required';
  end if;
  if p_endpoint is null or p_endpoint not in (
    'me.adaccounts', 'me.accounts', 'act.account', 'act.instagram_accounts', 'act.insights', 'act.campaigns',
    'debug_token', 'oauth.token', 'me.permissions',
    'act.adsets', 'act.adcreatives', 'act.ads', 'act.adimages', 'act.funding',
    'act.campaigns.create', 'act.adsets.create', 'act.adimages.create', 'act.adcreatives.create', 'act.ads.create',
    'act.campaigns.validate', 'act.adsets.validate', 'act.adcreatives.validate', 'act.ads.validate',
    'act.insights.campaign', 'campaign.status', 'adset.status', 'ad.status',
    'act.campaigns.update', 'act.adsets.update', 'act.ads.update'
  ) then
    raise exception 'unsupported Meta API endpoint';
  end if;
  if p_user_daily_limit is null or p_user_daily_limit < 1 or p_user_daily_limit > 100000
    or p_global_daily_limit is null or p_global_daily_limit < 1 or p_global_daily_limit > 100000 then
    raise exception 'Meta limits must be between 1 and 100000';
  end if;
  if p_connection_id is not null and not exists (
    select 1 from public.ads_connections c
     where c.id = p_connection_id and c.user_id = p_user_id and c.platform = 'meta' and c.status = 'active'
  ) then
    raise exception 'Meta connection does not belong to user';
  end if;

  v_is_write := p_endpoint like '%.create' or p_endpoint like '%.validate' or p_endpoint like '%.update';

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gloval-meta-ads-project-quota')::bigint);

  delete from public.ads_meta_api_operations where created_at < v_now - interval '16 days';

  select count(*)::integer into v_global_used
    from public.ads_meta_api_operations o
   where o.created_at >= v_window_start
     and (o.endpoint like '%.create' or o.endpoint like '%.validate' or o.endpoint like '%.update') = v_is_write;

  select count(*)::integer into v_user_used
    from public.ads_meta_api_operations o
   where o.user_id = p_user_id and o.created_at >= v_window_start
     and (o.endpoint like '%.create' or o.endpoint like '%.validate' or o.endpoint like '%.update') = v_is_write;

  if v_global_used >= p_global_daily_limit or v_user_used >= p_user_daily_limit then
    return query select false, v_global_used, v_user_used;
    return;
  end if;

  insert into public.ads_meta_api_operations (request_id, user_id, connection_id, endpoint)
  values (p_request_id, p_user_id, p_connection_id, p_endpoint);

  return query select true, v_global_used + 1, v_user_used + 1;
end
$$;

revoke all on function public.ads_reserve_meta_api_operation(uuid, uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ads_reserve_meta_api_operation(uuid, uuid, uuid, text, integer, integer)
  to service_role;

-- (c) Reserve a manage action (idempotent per request id) ----------------------
-- p_action: activate | pause | budget. Money-increasing actions (activate, budget increase) need explicit consent;
-- the consent text, budget and currency are frozen inside the append-only audit row (target.consent).
-- states: reserved | already_applied | already_failed | in_flight_duplicate | manage_in_progress | not_found |
--         plan_not_ready | transition_not_allowed | terms_required | idempotency_conflict | invalid_request
create or replace function public.ads_reserve_meta_manage_action(
  p_user_id uuid,
  p_plan_id uuid,
  p_connection_id uuid,
  p_request_id uuid,
  p_action text,
  p_new_budget_minor bigint,
  p_terms_accepted boolean,
  p_consent jsonb
)
returns table (state text, action_id uuid, plan_status text, previous_budget_minor bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_meta_plans%rowtype;
  v_existing public.ads_meta_actions%rowtype;
  v_action_type text;
  v_action_id uuid;
  v_increase boolean := false;
begin
  if p_user_id is null or p_plan_id is null or p_connection_id is null or p_request_id is null
    or p_action is null or p_action not in ('activate', 'pause', 'budget')
    or (p_action = 'budget' and (p_new_budget_minor is null or p_new_budget_minor <= 0))
    or (p_consent is not null and pg_catalog.jsonb_typeof(p_consent) <> 'object') then
    return query select 'invalid_request'::text, null::uuid, null::text, null::bigint; return;
  end if;

  v_action_type := case p_action
    when 'activate' then 'meta_campaign_activate'
    when 'pause' then 'meta_campaign_pause'
    else 'meta_budget_update'
  end;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('meta-ads-manage-plan:' || p_plan_id::text));

  select a.* into v_existing from public.ads_meta_actions a
   where a.user_id = p_user_id and a.action_type = v_action_type and a.idempotency_key = p_request_id for update;
  if found then
    if v_existing.plan_id is distinct from p_plan_id or v_existing.connection_id is distinct from p_connection_id then
      return query select 'idempotency_conflict'::text, null::uuid, null::text, null::bigint; return;
    end if;
    return query select
      case v_existing.status when 'applied' then 'already_applied' when 'failed' then 'already_failed' else 'in_flight_duplicate' end,
      v_existing.id, null::text, null::bigint;
    return;
  end if;

  select p.* into v_plan from public.ads_meta_plans p where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::bigint; return;
  end if;
  if v_plan.connection_id <> p_connection_id
    or v_plan.meta_campaign_id is null or v_plan.meta_adset_id is null or v_plan.meta_ad_id is null then
    return query select 'plan_not_ready'::text, null::uuid, v_plan.status, v_plan.daily_budget_minor; return;
  end if;

  -- One write at a time per plan; a row stuck "proposed" for over 2 minutes no longer blocks.
  if exists (
    select 1 from public.ads_meta_actions a
     where a.plan_id = v_plan.id and a.status = 'proposed'
       and a.action_type in ('meta_campaign_activate', 'meta_campaign_pause', 'meta_budget_update')
       and a.created_at > pg_catalog.now() - interval '2 minutes'
  ) then
    return query select 'manage_in_progress'::text, null::uuid, v_plan.status, v_plan.daily_budget_minor; return;
  end if;

  if p_action = 'activate' and v_plan.status not in ('published', 'user_paused') then
    return query select 'transition_not_allowed'::text, null::uuid, v_plan.status, v_plan.daily_budget_minor; return;
  end if;
  if p_action = 'pause' and v_plan.status <> 'active' then
    return query select 'transition_not_allowed'::text, null::uuid, v_plan.status, v_plan.daily_budget_minor; return;
  end if;
  if p_action = 'budget' then
    if v_plan.status not in ('published', 'user_paused', 'active') or p_new_budget_minor = v_plan.daily_budget_minor then
      return query select 'transition_not_allowed'::text, null::uuid, v_plan.status, v_plan.daily_budget_minor; return;
    end if;
    v_increase := v_plan.daily_budget_minor is null or p_new_budget_minor > v_plan.daily_budget_minor;
  end if;

  if (p_action = 'activate' or v_increase) and (p_terms_accepted is not true or p_consent is null) then
    return query select 'terms_required'::text, null::uuid, v_plan.status, v_plan.daily_budget_minor; return;
  end if;

  insert into public.ads_meta_actions (
    user_id, plan_id, connection_id, actor, action_type, idempotency_key, target, before_state, status
  ) values (
    p_user_id, v_plan.id, p_connection_id, 'user', v_action_type, p_request_id,
    pg_catalog.jsonb_build_object(
      'action', p_action,
      'plan_version', v_plan.version,
      'new_budget_minor', p_new_budget_minor,
      'budget_increase', v_increase,
      'consent', p_consent
    ),
    pg_catalog.jsonb_build_object('plan_status', v_plan.status, 'daily_budget_minor', v_plan.daily_budget_minor),
    'proposed'
  ) returning id into v_action_id;

  return query select 'reserved'::text, v_action_id, v_plan.status, v_plan.daily_budget_minor;
end
$$;

revoke all on function public.ads_reserve_meta_manage_action(uuid, uuid, uuid, uuid, text, bigint, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.ads_reserve_meta_manage_action(uuid, uuid, uuid, uuid, text, bigint, boolean, jsonb)
  to service_role;

-- (d) Finish: one atomic write of plan state + audit outcome -------------------
-- p_outcome: applied | failed | unknown. 'unknown' keeps the row "proposed" (the outcome could not be verified; the
-- next status sync reconciles it) but still records the attempt in after_state.
create or replace function public.ads_finish_meta_manage_action(
  p_user_id uuid,
  p_plan_id uuid,
  p_action_id uuid,
  p_outcome text,
  p_new_plan_status text,
  p_new_budget_minor bigint,
  p_effective_status text,
  p_failure_code text,
  p_snapshot jsonb
)
returns table (state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_meta_plans%rowtype;
  v_action public.ads_meta_actions%rowtype;
begin
  if p_user_id is null or p_plan_id is null or p_action_id is null
    or p_outcome is null or p_outcome not in ('applied', 'failed', 'unknown')
    or (p_new_plan_status is not null and p_new_plan_status not in ('published', 'active', 'user_paused'))
    or (p_new_budget_minor is not null and p_new_budget_minor <= 0)
    or (p_snapshot is not null and pg_catalog.jsonb_typeof(p_snapshot) <> 'object') then
    return query select 'invalid_request'::text; return;
  end if;

  select p.* into v_plan from public.ads_meta_plans p where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then
    return query select 'not_found'::text; return;
  end if;
  select a.* into v_action from public.ads_meta_actions a
   where a.id = p_action_id and a.user_id = p_user_id and a.plan_id = p_plan_id for update;
  if not found then
    return query select 'not_found'::text; return;
  end if;
  if v_action.status in ('applied', 'failed') then
    return query select 'already_finished'::text; return;
  end if;

  if p_outcome = 'applied' then
    update public.ads_meta_plans
       set status = coalesce(p_new_plan_status, status),
           daily_budget_minor = coalesce(p_new_budget_minor, daily_budget_minor),
           current_effective_status = coalesce(p_effective_status, current_effective_status),
           live_snapshot = coalesce(p_snapshot, live_snapshot),
           last_synced_at = pg_catalog.now(),
           activated_at = case
             when p_new_plan_status = 'active' and activated_at is null then pg_catalog.now()
             else activated_at
           end
     where id = v_plan.id;
  end if;

  update public.ads_meta_actions
     set status = case p_outcome when 'applied' then 'applied' when 'failed' then 'failed' else status end,
         applied_at = case when p_outcome = 'unknown' then applied_at else pg_catalog.now() end,
         after_state = pg_catalog.jsonb_build_object(
           'outcome', p_outcome,
           'plan_status', coalesce(p_new_plan_status, v_plan.status),
           'daily_budget_minor', coalesce(p_new_budget_minor, v_plan.daily_budget_minor),
           'effective_status', p_effective_status,
           'failure_code', p_failure_code
         )
   where id = v_action.id;

  return query select p_outcome;
end
$$;

revoke all on function public.ads_finish_meta_manage_action(uuid, uuid, uuid, text, text, bigint, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ads_finish_meta_manage_action(uuid, uuid, uuid, text, text, bigint, text, text, jsonb)
  to service_role;

-- (e) Status sync (drift correction) -------------------------------------------
-- Writes what Meta reports back onto the plan. A change made outside GLOVAL (e.g. paused or re-budgeted in Ads
-- Manager) is recorded once as an audit row (meta_status_sync, actor system) with before/after.
create or replace function public.ads_sync_meta_plan_state(
  p_user_id uuid,
  p_plan_id uuid,
  p_new_plan_status text,
  p_new_budget_minor bigint,
  p_effective_status text,
  p_snapshot jsonb
)
returns table (state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_meta_plans%rowtype;
  v_drift boolean;
begin
  if p_user_id is null or p_plan_id is null
    or (p_new_plan_status is not null and p_new_plan_status not in ('published', 'active', 'user_paused', 'archived'))
    or (p_new_budget_minor is not null and p_new_budget_minor <= 0)
    or (p_snapshot is not null and pg_catalog.jsonb_typeof(p_snapshot) <> 'object') then
    return query select 'invalid_request'::text; return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('meta-ads-manage-plan:' || p_plan_id::text));

  select p.* into v_plan from public.ads_meta_plans p where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then
    return query select 'not_found'::text; return;
  end if;
  if v_plan.status not in ('published', 'active', 'user_paused') then
    return query select 'not_applicable'::text; return;
  end if;
  if exists (
    select 1 from public.ads_meta_actions a
     where a.plan_id = v_plan.id and a.status = 'proposed'
       and a.action_type in ('meta_campaign_activate', 'meta_campaign_pause', 'meta_budget_update')
       and a.created_at > pg_catalog.now() - interval '2 minutes'
  ) then
    return query select 'manage_in_progress'::text; return;
  end if;

  v_drift := (p_new_plan_status is not null and p_new_plan_status <> v_plan.status)
          or (p_new_budget_minor is not null and p_new_budget_minor is distinct from v_plan.daily_budget_minor);

  update public.ads_meta_plans
     set status = coalesce(p_new_plan_status, status),
         daily_budget_minor = coalesce(p_new_budget_minor, daily_budget_minor),
         current_effective_status = p_effective_status,
         live_snapshot = p_snapshot,
         last_synced_at = pg_catalog.now(),
         activated_at = case
           when coalesce(p_new_plan_status, status) = 'active' and activated_at is null then pg_catalog.now()
           else activated_at
         end
   where id = v_plan.id;

  if v_drift then
    insert into public.ads_meta_actions (
      user_id, plan_id, connection_id, actor, action_type, target, before_state, after_state, status, applied_at
    ) values (
      p_user_id, v_plan.id, v_plan.connection_id, 'system', 'meta_status_sync',
      pg_catalog.jsonb_build_object('reason', 'changed_outside_gloval'),
      pg_catalog.jsonb_build_object('plan_status', v_plan.status, 'daily_budget_minor', v_plan.daily_budget_minor),
      pg_catalog.jsonb_build_object('plan_status', coalesce(p_new_plan_status, v_plan.status),
                                    'daily_budget_minor', coalesce(p_new_budget_minor, v_plan.daily_budget_minor)),
      'applied', pg_catalog.now()
    );
    return query select 'drift_recorded'::text; return;
  end if;

  return query select 'synced'::text;
end
$$;

revoke all on function public.ads_sync_meta_plan_state(uuid, uuid, text, bigint, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ads_sync_meta_plan_state(uuid, uuid, text, bigint, text, jsonb)
  to service_role;

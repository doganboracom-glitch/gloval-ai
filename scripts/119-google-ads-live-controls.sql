-- Draft only: do not apply until the Google Ads live-controls rollout is approved.
-- Uses the existing append-only ads_actions table for attempts and policy audit.

create or replace function public.ads_reserve_google_ads_publish_capacity(
  p_user_id uuid,
  p_plan_id uuid,
  p_connection_id uuid,
  p_request_id uuid,
  p_max_active_campaigns_per_user integer,
  p_daily_attempts_per_user integer,
  p_daily_attempts_global integer
)
returns table(state text, action_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action_id uuid;
  v_user_attempts bigint;
  v_global_attempts bigint;
  v_active_campaigns bigint;
  v_denial text;
begin
  if p_user_id is null or p_plan_id is null or p_connection_id is null or p_request_id is null
     or p_max_active_campaigns_per_user is null or p_max_active_campaigns_per_user not between 1 and 10
     or p_daily_attempts_per_user is null or p_daily_attempts_per_user not between 1 and 100
     or p_daily_attempts_global is null or p_daily_attempts_global not between 1 and 5000 then
    return query select 'invalid_request'::text, null::uuid;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('google-ads-publish-global', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('google-ads-publish-user:' || p_user_id::text, 0)
  );

  select a.id into v_action_id
    from public.ads_actions a
   where a.user_id = p_user_id
     and a.idempotency_key = p_request_id
     and a.action_type = 'google_ads_publish_attempt_reserved'
   limit 1;
  if v_action_id is not null then
    return query select 'reserved'::text, v_action_id;
    return;
  end if;

  if not exists (
    select 1 from public.ads_plans p
     where p.id = p_plan_id and p.user_id = p_user_id
       and p.connection_id = p_connection_id and p.platform = 'google_ads'
       and p.status = 'approved' and p.external_campaign_id is null
  ) then
    return query select 'plan_not_ready'::text, null::uuid;
    return;
  end if;

  select pg_catalog.count(*) into v_user_attempts
    from public.ads_actions a
   where a.user_id = p_user_id
     and a.action_type = 'google_ads_publish_attempt_reserved'
     and a.created_at >= pg_catalog.clock_timestamp() - interval '24 hours';
  select pg_catalog.count(*) into v_global_attempts
    from public.ads_actions a
   where a.action_type = 'google_ads_publish_attempt_reserved'
     and a.created_at >= pg_catalog.clock_timestamp() - interval '24 hours';

  select pg_catalog.count(*) into v_active_campaigns
    from (
      select p.id
        from public.ads_plans p
       where p.user_id = p_user_id
         and p.platform = 'google_ads'
         and p.id <> p_plan_id
         and p.status = 'published'
         and p.external_campaign_id is not null
         and p.google_campaign_status in ('ENABLED', 'PAUSED')
      union
      select a.plan_id
        from public.ads_actions a
       where a.user_id = p_user_id
         and a.action_type in (
           'google_ads_publish_attempt_reserved',
           'google_ads_campaign_enable_capacity_reserved'
         )
         and a.status = 'proposed'
         and a.plan_id <> p_plan_id
    ) active_campaigns;

  if v_active_campaigns >= p_max_active_campaigns_per_user then
    v_denial := 'active_campaign_limit_reached';
  elsif v_user_attempts >= p_daily_attempts_per_user then
    v_denial := 'user_publish_limit_reached';
  elsif v_global_attempts >= p_daily_attempts_global then
    v_denial := 'global_publish_limit_reached';
  end if;

  if v_denial is not null then
    insert into public.ads_actions
      (user_id, plan_id, connection_id, actor, action_type, target, after_state,
       reversible, status, failure_reason, applied_at)
    values
      (p_user_id, p_plan_id, p_connection_id, 'system', 'google_ads_policy_blocked',
       pg_catalog.jsonb_build_object('operation', 'publish', 'reason_code', v_denial),
       pg_catalog.jsonb_build_object('reason_code', v_denial), false, 'failed', v_denial,
       pg_catalog.clock_timestamp());
    return query select v_denial, null::uuid;
    return;
  end if;

  insert into public.ads_actions
    (user_id, plan_id, connection_id, actor, action_type, target, reversible,
     status, idempotency_key)
  values
    (p_user_id, p_plan_id, p_connection_id, 'system', 'google_ads_publish_attempt_reserved',
     pg_catalog.jsonb_build_object('request_id', p_request_id), false, 'proposed', p_request_id)
  returning id into v_action_id;

  return query select 'reserved'::text, v_action_id;
end;
$$;

create or replace function public.ads_finish_google_ads_publish_capacity(
  p_user_id uuid,
  p_action_id uuid,
  p_outcome text,
  p_reason_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_outcome not in ('success', 'failure') then return false; end if;
  v_status := case when p_outcome = 'success' then 'applied' else 'failed' end;

  update public.ads_actions a
     set status = v_status,
         after_state = pg_catalog.jsonb_build_object(
           'outcome', p_outcome,
           'reason_code', case when p_outcome = 'failure' then p_reason_code else null end
         ),
         applied_at = pg_catalog.clock_timestamp()
   where a.id = p_action_id
     and a.user_id = p_user_id
     and a.action_type = 'google_ads_publish_attempt_reserved'
     and a.status = 'proposed';

  return found;
end;
$$;

create or replace function public.ads_reserve_google_ads_campaign_enable_capacity(
  p_user_id uuid,
  p_plan_id uuid,
  p_connection_id uuid,
  p_request_id uuid,
  p_max_active_campaigns_per_user integer
)
returns table(state text, action_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action_id uuid;
  v_active_campaigns bigint;
  v_denial text;
begin
  if p_user_id is null or p_plan_id is null or p_connection_id is null or p_request_id is null
     or p_max_active_campaigns_per_user is null or p_max_active_campaigns_per_user not between 1 and 10 then
    return query select 'invalid_request'::text, null::uuid;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('google-ads-publish-user:' || p_user_id::text, 0)
  );

  select a.id into v_action_id
    from public.ads_actions a
   where a.user_id = p_user_id
     and a.idempotency_key = p_request_id
     and a.action_type = 'google_ads_campaign_enable_capacity_reserved'
   limit 1;
  if v_action_id is not null then
    return query select 'reserved'::text, v_action_id;
    return;
  end if;

  if exists (
    select 1 from public.ads_actions a
     where a.user_id = p_user_id
       and a.plan_id = p_plan_id
       and a.action_type = 'google_ads_campaign_enable_capacity_reserved'
       and a.status = 'proposed'
  ) then
    return query select 'enable_in_progress'::text, null::uuid;
    return;
  end if;

  if not exists (
    select 1 from public.ads_plans p
     where p.id = p_plan_id and p.user_id = p_user_id
       and p.connection_id = p_connection_id and p.platform = 'google_ads'
       and p.status = 'published' and p.external_campaign_id is not null
       and p.google_campaign_status in ('ENABLED', 'PAUSED')
  ) then
    return query select 'plan_not_ready'::text, null::uuid;
    return;
  end if;

  select pg_catalog.count(*) into v_active_campaigns
    from (
      select p.id
        from public.ads_plans p
       where p.user_id = p_user_id
         and p.platform = 'google_ads'
         and p.id <> p_plan_id
         and p.status = 'published'
         and p.external_campaign_id is not null
         and p.google_campaign_status in ('ENABLED', 'PAUSED')
      union
      select a.plan_id
        from public.ads_actions a
       where a.user_id = p_user_id
         and a.action_type in (
           'google_ads_publish_attempt_reserved',
           'google_ads_campaign_enable_capacity_reserved'
         )
         and a.status = 'proposed'
         and a.plan_id <> p_plan_id
    ) active_campaigns;

  if v_active_campaigns >= p_max_active_campaigns_per_user then
    v_denial := 'active_campaign_limit_reached';
    insert into public.ads_actions
      (user_id, plan_id, connection_id, actor, action_type, target, after_state,
       reversible, status, failure_reason, applied_at)
    values
      (p_user_id, p_plan_id, p_connection_id, 'system', 'google_ads_policy_blocked',
       pg_catalog.jsonb_build_object('operation', 'enable', 'reason_code', v_denial),
       pg_catalog.jsonb_build_object('reason_code', v_denial), false, 'failed', v_denial,
       pg_catalog.clock_timestamp());
    return query select v_denial, null::uuid;
    return;
  end if;

  insert into public.ads_actions
    (user_id, plan_id, connection_id, actor, action_type, target, reversible,
     status, idempotency_key)
  values
    (p_user_id, p_plan_id, p_connection_id, 'system', 'google_ads_campaign_enable_capacity_reserved',
     pg_catalog.jsonb_build_object('operation', 'enable', 'request_id', p_request_id), false,
     'proposed', p_request_id)
  returning id into v_action_id;

  return query select 'reserved'::text, v_action_id;
end;
$$;

create or replace function public.ads_finish_google_ads_campaign_enable_capacity(
  p_user_id uuid,
  p_action_id uuid,
  p_outcome text,
  p_reason_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('success', 'failure') then return false; end if;

  update public.ads_actions a
     set status = case when p_outcome = 'success' then 'applied' else 'failed' end,
         after_state = pg_catalog.jsonb_build_object(
           'outcome', p_outcome,
           'reason_code', case when p_outcome = 'failure' then p_reason_code else null end
         ),
         failure_reason = case when p_outcome = 'failure' then p_reason_code else null end,
         applied_at = pg_catalog.clock_timestamp()
   where a.id = p_action_id
     and a.user_id = p_user_id
     and a.action_type = 'google_ads_campaign_enable_capacity_reserved'
     and a.status = 'proposed';

  return found;
end;
$$;

revoke all on function public.ads_reserve_google_ads_publish_capacity(uuid, uuid, uuid, uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.ads_finish_google_ads_publish_capacity(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.ads_reserve_google_ads_campaign_enable_capacity(uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.ads_finish_google_ads_campaign_enable_capacity(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.ads_reserve_google_ads_publish_capacity(uuid, uuid, uuid, uuid, integer, integer, integer)
  to service_role;
grant execute on function public.ads_finish_google_ads_publish_capacity(uuid, uuid, text, text)
  to service_role;
grant execute on function public.ads_reserve_google_ads_campaign_enable_capacity(uuid, uuid, uuid, uuid, integer)
  to service_role;
grant execute on function public.ads_finish_google_ads_campaign_enable_capacity(uuid, uuid, text, text)
  to service_role;

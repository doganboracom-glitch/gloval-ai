-- DRAFT ONLY: review and apply explicitly through the Supabase MCP. This file has not been run against the live database; runtime code calls the v2 capacity RPCs below.
--
-- Scope: only the per-user / global publish-attempt capacity RPCs. Approval, publish and
-- management RPCs live in 123-ads-google-remove-budget-cap.sql; this file must not
-- redefine them or reference the removed budget-cap columns.

BEGIN;

-- p_daily_attempts_per_user: a null value falls back to the default of 30 attempts per
-- 24 hours so per-user protection is always on.
-- p_daily_attempts_global: a null value means unlimited.
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
  v_user_limit integer := coalesce(p_daily_attempts_per_user, 30);
  v_user_attempts bigint;
  v_global_attempts bigint;
  v_denial text;
begin
  if p_user_id is null or p_plan_id is null or p_connection_id is null or p_request_id is null
    or v_user_limit <= 0
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
  if v_user_attempts >= v_user_limit then
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
      user_id, plan_id, connection_id, actor, action_type, target, before_state, after_state,
      reversible, status, idempotency_key, expected_version, failure_reason, applied_at
    ) values (
      p_user_id, p_plan_id, p_connection_id, 'system', 'google_ads_policy_blocked',
      jsonb_build_object('operation', 'publish_attempt_quota'), '{}'::jsonb,
      jsonb_build_object('reason_code', v_denial), false, 'failed', p_request_id,
      v_plan.version, v_denial, now()
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

revoke all on function public.ads_reserve_google_ads_publish_capacity_v2(uuid, uuid, uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.ads_finish_google_ads_publish_capacity_v2(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.ads_reserve_google_ads_publish_capacity_v2(uuid, uuid, uuid, uuid, integer, integer) to service_role;
grant execute on function public.ads_finish_google_ads_publish_capacity_v2(uuid, uuid, text, text) to service_role;

COMMIT;

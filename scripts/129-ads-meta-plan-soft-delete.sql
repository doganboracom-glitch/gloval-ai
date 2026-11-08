-- UNAPPLIED DRAFT. Do not run directly; review and apply only through the approved migration workflow.
-- GLOVAL Ads / Meta: safe plan soft-delete + account minimum-budget endpoint quota support.
-- Run after 128. No Meta object is deleted or changed by this migration.

-- (a) Soft-delete marker; keep the row and its audit history, but exclude it from every plan list.
alter table public.ads_meta_plans add column if not exists deleted_at timestamptz;
create index if not exists ads_meta_plans_visible_user_idx
  on public.ads_meta_plans (user_id, updated_at desc) where deleted_at is null;

-- A soft-deleted draft is archived in GLOVAL, but is exempt from publication-only row requirements.
alter table public.ads_meta_plans drop constraint if exists ads_meta_plans_approved_check;
alter table public.ads_meta_plans
  add constraint ads_meta_plans_approved_check check (
    deleted_at is not null
    or status in ('draft', 'validated', 'failed')
    or (approved_at is not null and plan_hash is not null and approved_version is not null)
  );
alter table public.ads_meta_plans drop constraint if exists ads_meta_plans_published_check;
alter table public.ads_meta_plans
  add constraint ads_meta_plans_published_check check (
    deleted_at is not null
    or status not in ('published', 'active', 'user_paused')
    or (meta_campaign_id is not null and meta_adset_id is not null and meta_ad_id is not null and published_at is not null)
  );

-- Freeze deleted rows, including stale publish/manage requests that were already in flight.
create or replace function public.ads_meta_plans_deleted_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'Meta plan is soft-deleted';
  end if;
  return new;
end
$$;
drop trigger if exists ads_meta_plans_deleted_guard_trg on public.ads_meta_plans;
create trigger ads_meta_plans_deleted_guard_trg
  before update on public.ads_meta_plans
  for each row execute function public.ads_meta_plans_deleted_guard();

-- (b) Add the Meta account minimum-budgets read edge to the allow-list and existing read quota.
alter table public.ads_meta_api_operations drop constraint if exists ads_meta_api_operations_endpoint_check;
alter table public.ads_meta_api_operations
  add constraint ads_meta_api_operations_endpoint_check check (
    endpoint in (
      'me.adaccounts', 'me.accounts', 'act.account', 'act.instagram_accounts', 'act.insights', 'act.campaigns',
      'debug_token', 'oauth.token', 'me.permissions',
      'act.adsets', 'act.adcreatives', 'act.ads', 'act.adimages', 'act.funding', 'act.minimum_budgets',
      'act.campaigns.create', 'act.adsets.create', 'act.adimages.create', 'act.adcreatives.create', 'act.ads.create',
      'act.campaigns.validate', 'act.adsets.validate', 'act.adcreatives.validate', 'act.ads.validate',
      'act.insights.campaign', 'campaign.status', 'adset.status', 'ad.status',
      'act.campaigns.update', 'act.adsets.update', 'act.ads.update'
    )
  );

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
    'act.adsets', 'act.adcreatives', 'act.ads', 'act.adimages', 'act.funding', 'act.minimum_budgets',
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

-- (c) Atomic, owner-scoped, audited soft-delete. All external objects must have a confirmed non-active status.
create or replace function public.ads_soft_delete_meta_plan(
  p_user_id uuid,
  p_plan_id uuid,
  p_meta_statuses jsonb default null
)
returns table (state text, deleted_at timestamptz, plan_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_meta_plans%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_effective text;
begin
  if p_user_id is null or p_plan_id is null
    or (p_meta_statuses is not null and pg_catalog.jsonb_typeof(p_meta_statuses) <> 'object') then
    return query select 'invalid_request'::text, null::timestamptz, null::text;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('meta-ads-manage-plan:' || p_plan_id::text));
  select p.* into v_plan
    from public.ads_meta_plans p
   where p.id = p_plan_id and p.user_id = p_user_id
   for update;
  if not found or v_plan.deleted_at is not null then
    return query select 'not_found'::text, null::timestamptz, null::text;
    return;
  end if;
  if v_plan.status = 'publishing' or exists (
    select 1 from public.ads_meta_actions a
     where a.plan_id = v_plan.id and a.status = 'proposed'
       and a.action_type in (
         'meta_publish_attempt_reserved', 'meta_campaign_activate', 'meta_campaign_pause', 'meta_budget_update'
       )
       and a.created_at > v_now - interval '2 minutes'
  ) then
    return query select 'plan_busy'::text, null::timestamptz, v_plan.status;
    return;
  end if;

  if v_plan.meta_campaign_id is not null or v_plan.meta_adset_id is not null or v_plan.meta_ad_id is not null then
    if p_meta_statuses is null
      or (v_plan.meta_campaign_id is not null and pg_catalog.jsonb_typeof(p_meta_statuses->'campaign') is distinct from 'object')
      or (v_plan.meta_adset_id is not null and pg_catalog.jsonb_typeof(p_meta_statuses->'adSet') is distinct from 'object')
      or (v_plan.meta_ad_id is not null and pg_catalog.jsonb_typeof(p_meta_statuses->'ad') is distinct from 'object') then
      return query select 'meta_confirmation_required'::text, null::timestamptz, v_plan.status;
      return;
    end if;

    if p_meta_statuses->'campaign'->>'status' = 'ACTIVE'
      or p_meta_statuses->'adSet'->>'status' = 'ACTIVE'
      or p_meta_statuses->'ad'->>'status' = 'ACTIVE'
      or p_meta_statuses->'campaign'->>'effectiveStatus' = 'ACTIVE'
      or p_meta_statuses->'adSet'->>'effectiveStatus' = 'ACTIVE'
      or p_meta_statuses->'ad'->>'effectiveStatus' = 'ACTIVE' then
      return query select 'active'::text, null::timestamptz, v_plan.status;
      return;
    end if;

    if (v_plan.meta_campaign_id is not null and coalesce(p_meta_statuses->'campaign'->>'status', '') not in ('PAUSED', 'ARCHIVED', 'DELETED'))
      or (v_plan.meta_adset_id is not null and coalesce(p_meta_statuses->'adSet'->>'status', '') not in ('PAUSED', 'ARCHIVED', 'DELETED'))
      or (v_plan.meta_ad_id is not null and coalesce(p_meta_statuses->'ad'->>'status', '') not in ('PAUSED', 'ARCHIVED', 'DELETED')) then
      return query select 'meta_confirmation_required'::text, null::timestamptz, v_plan.status;
      return;
    end if;
  elsif v_plan.status = 'active' then
    return query select 'active'::text, null::timestamptz, v_plan.status;
    return;
  end if;

  v_effective := coalesce(
    p_meta_statuses->'ad'->>'effectiveStatus',
    p_meta_statuses->'adSet'->>'effectiveStatus',
    p_meta_statuses->'campaign'->>'effectiveStatus'
  );
  -- Keep the record archived so any stale publish/manage reservation rejects before making a Meta write.
  update public.ads_meta_plans p
     set deleted_at = v_now,
         status = 'archived',
         current_effective_status = coalesce(v_effective, p.current_effective_status),
         last_synced_at = case when p_meta_statuses is null then p.last_synced_at else v_now end,
         live_snapshot = case when p_meta_statuses is null then p.live_snapshot
           else coalesce(p.live_snapshot, '{}'::jsonb) || pg_catalog.jsonb_build_object(
             'softDeleteConfirmation', p_meta_statuses, 'confirmedAt', v_now
           ) end
   where p.id = v_plan.id;

  insert into public.ads_meta_actions (
    user_id, plan_id, connection_id, actor, action_type, target, before_state, after_state, status, applied_at
  ) values (
    p_user_id, v_plan.id, v_plan.connection_id, 'user', 'meta_plan_soft_deleted',
    pg_catalog.jsonb_build_object('plan_id', v_plan.id),
    pg_catalog.jsonb_build_object(
      'status', v_plan.status,
      'meta_campaign_id', v_plan.meta_campaign_id,
      'meta_adset_id', v_plan.meta_adset_id,
      'meta_ad_id', v_plan.meta_ad_id,
      'current_effective_status', v_plan.current_effective_status
    ),
    pg_catalog.jsonb_build_object(
      'status', 'archived', 'deleted_at', v_now, 'meta_statuses', p_meta_statuses
    ),
    'applied', v_now
  );

  return query select 'deleted'::text, v_now, 'archived'::text;
end
$$;
revoke all on function public.ads_soft_delete_meta_plan(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ads_soft_delete_meta_plan(uuid, uuid, jsonb) to service_role;

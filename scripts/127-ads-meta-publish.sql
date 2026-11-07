-- UNAPPLIED DRAFT. Review and apply only through the approved migration workflow.
-- GLOVAL Ads / Meta (Facebook + Instagram), phase M2 = paused campaign publishing.
--
-- Design choice: Meta plans live in their own tables instead of public.ads_plans/ads_actions.
--   * ads_actions.plan_id references ads_plans, and ads_plans carries Google-specific constraints
--     (budget cap, published requires external_campaign_id, approved_version...). Reusing it would mean
--     loosening live Google constraints; separate tables cannot break Google publishing.
--   * ads_meta_actions mirrors the append-only ads_actions guard (only status/after_state/applied_at may change).
-- Run order: after 126. No begin/commit on purpose (apply step by step through the migration workflow).

-- (a) Meta plans -------------------------------------------------------------
create table if not exists public.ads_meta_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.ads_connections(id) on delete no action,
  -- Status list is intentionally wider than M2 so Phase M3 (activate / pause / archive) needs no constraint change.
  status text not null default 'draft'
    check (status in ('draft', 'validated', 'approved', 'publishing', 'published', 'partial', 'failed', 'active', 'user_paused', 'archived')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  version integer not null default 1 check (version > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  daily_budget_minor bigint check (daily_budget_minor is null or daily_budget_minor > 0),
  -- Short code appended to every Meta object name (gloval-req-<12 hex>) so a retry can re-find objects.
  request_id uuid not null default gen_random_uuid(),
  image_sha256 text check (image_sha256 is null or image_sha256 ~ '^[a-f0-9]{64}$'),
  plan_hash text check (plan_hash is null or plan_hash ~ '^[a-f0-9]{64}$'),
  approved_version integer,
  approved_at timestamptz,
  approval_summary jsonb,
  validated_version integer,
  validated_at timestamptz,
  meta_campaign_id text check (meta_campaign_id is null or meta_campaign_id ~ '^[0-9]{5,25}$'),
  meta_adset_id text check (meta_adset_id is null or meta_adset_id ~ '^[0-9]{5,25}$'),
  meta_image_hash text check (meta_image_hash is null or meta_image_hash ~ '^[A-Za-z0-9]{8,64}$'),
  meta_creative_id text check (meta_creative_id is null or meta_creative_id ~ '^[0-9]{5,25}$'),
  meta_ad_id text check (meta_ad_id is null or meta_ad_id ~ '^[0-9]{5,25}$'),
  failure_step text check (failure_step is null or failure_step in ('preflight', 'campaign', 'adset', 'image', 'creative', 'ad')),
  failure_code text,
  failure_reason text check (failure_reason is null or pg_catalog.length(failure_reason) <= 600),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ads_meta_plans_approved_check check (
    status in ('draft', 'validated', 'failed')
    or (approved_at is not null and plan_hash is not null and approved_version is not null)
  ),
  constraint ads_meta_plans_published_check check (
    status not in ('published', 'active', 'user_paused')
    or (meta_campaign_id is not null and meta_adset_id is not null and meta_ad_id is not null and published_at is not null)
  )
);

create index if not exists ads_meta_plans_user_idx on public.ads_meta_plans (user_id, updated_at desc);
create index if not exists ads_meta_plans_connection_idx on public.ads_meta_plans (connection_id);
create unique index if not exists ads_meta_plans_campaign_uniq
  on public.ads_meta_plans (connection_id, meta_campaign_id) where meta_campaign_id is not null;

create or replace function public.ads_meta_plans_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id or new.connection_id <> old.connection_id or new.request_id <> old.request_id then
    raise exception 'ads_meta_plans owner, connection and request id are immutable';
  end if;
  new.updated_at := pg_catalog.now();
  if not exists (
    select 1 from public.ads_connections c
     where c.id = new.connection_id and c.user_id = new.user_id and c.platform = 'meta'
  ) then
    raise exception 'connection does not belong to plan owner';
  end if;
  return new;
end
$$;

drop trigger if exists ads_meta_plans_guard_trg on public.ads_meta_plans;
create trigger ads_meta_plans_guard_trg
  before update on public.ads_meta_plans
  for each row execute function public.ads_meta_plans_guard();

alter table public.ads_meta_plans enable row level security;
alter table public.ads_meta_plans force row level security;
revoke all on table public.ads_meta_plans from public, anon, authenticated;
grant select, insert, update on table public.ads_meta_plans to service_role;

-- (b) Append-only audit log --------------------------------------------------
-- action_type values used by M2: meta_plan_approved, meta_publish_attempt_reserved, meta_publish_denied,
-- meta_publish_campaign|adset|image|creative|ad (one per step), meta_publish_finished, meta_validate_only.
-- Phase M3 adds more names (e.g. meta_campaign_activate); there is deliberately no check on action_type.
create table if not exists public.ads_meta_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.ads_meta_plans(id) on delete set null,
  connection_id uuid references public.ads_connections(id) on delete set null,
  actor text not null check (actor in ('user', 'ai', 'system')),
  action_type text not null check (action_type ~ '^[a-z0-9_]{3,64}$'),
  idempotency_key uuid,
  target jsonb,
  before_state jsonb,
  after_state jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'applied', 'failed', 'undone')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists ads_meta_actions_user_idx on public.ads_meta_actions (user_id, created_at desc);
create index if not exists ads_meta_actions_plan_idx on public.ads_meta_actions (plan_id, created_at) where plan_id is not null;
create index if not exists ads_meta_actions_capacity_idx
  on public.ads_meta_actions (action_type, created_at) where action_type = 'meta_publish_attempt_reserved';
create unique index if not exists ads_meta_actions_idempotency_uniq
  on public.ads_meta_actions (user_id, action_type, idempotency_key) where idempotency_key is not null;

create or replace function public.ads_meta_actions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ads_meta_actions rows are append-only';
  end if;
  if new.id <> old.id
     or new.user_id <> old.user_id
     or new.actor <> old.actor
     or new.action_type <> old.action_type
     or new.idempotency_key is distinct from old.idempotency_key
     or new.target is distinct from old.target
     or new.before_state is distinct from old.before_state
     or new.created_at <> old.created_at then
    raise exception 'ads_meta_actions rows are append-only; only status, after_state and applied_at may change';
  end if;
  return new;
end
$$;

drop trigger if exists ads_meta_actions_guard_trg on public.ads_meta_actions;
create trigger ads_meta_actions_guard_trg
  before update or delete on public.ads_meta_actions
  for each row execute function public.ads_meta_actions_guard();

alter table public.ads_meta_actions enable row level security;
alter table public.ads_meta_actions force row level security;
revoke all on table public.ads_meta_actions from public, anon, authenticated;
grant select, insert, update on table public.ads_meta_actions to service_role;

-- (c) Graph operation counter: new write endpoints + separate write quota ----
alter table public.ads_meta_api_operations drop constraint if exists ads_meta_api_operations_endpoint_check;
alter table public.ads_meta_api_operations
  add constraint ads_meta_api_operations_endpoint_check check (
    endpoint in (
      'me.adaccounts', 'me.accounts', 'act.account', 'act.instagram_accounts', 'act.insights', 'act.campaigns',
      'debug_token', 'oauth.token', 'me.permissions',
      'act.adsets', 'act.adcreatives', 'act.ads', 'act.adimages', 'act.funding',
      'act.campaigns.create', 'act.adsets.create', 'act.adimages.create', 'act.adcreatives.create', 'act.ads.create',
      'act.campaigns.validate', 'act.adsets.validate', 'act.adcreatives.validate', 'act.ads.validate'
    )
  );

-- Reads and writes are counted in separate sliding 24h windows (same table, split by endpoint suffix).
-- Defaults chosen by the caller: writes 300 / user and 2400 global, reads unchanged.
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
    'act.campaigns.validate', 'act.adsets.validate', 'act.adcreatives.validate', 'act.ads.validate'
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

  v_is_write := p_endpoint like '%.create' or p_endpoint like '%.validate';

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gloval-meta-ads-project-quota')::bigint);

  delete from public.ads_meta_api_operations where created_at < v_now - interval '16 days';

  select count(*)::integer into v_global_used
    from public.ads_meta_api_operations o
   where o.created_at >= v_window_start
     and (o.endpoint like '%.create' or o.endpoint like '%.validate') = v_is_write;

  select count(*)::integer into v_user_used
    from public.ads_meta_api_operations o
   where o.user_id = p_user_id and o.created_at >= v_window_start
     and (o.endpoint like '%.create' or o.endpoint like '%.validate') = v_is_write;

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

-- (d) Approval ---------------------------------------------------------------
create or replace function public.ads_approve_meta_plan(
  p_user_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_connection_id uuid,
  p_plan_hash text,
  p_approval_summary jsonb
)
returns table (state text, approval_id uuid, plan_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_meta_plans%rowtype;
  v_action_id uuid;
begin
  if p_user_id is null or p_plan_id is null or p_connection_id is null
    or p_plan_hash is null or p_plan_hash !~ '^[a-f0-9]{64}$'
    or p_approval_summary is null or pg_catalog.jsonb_typeof(p_approval_summary) <> 'object' then
    return query select 'invalid_request'::text, null::uuid, null::integer; return;
  end if;

  select p.* into v_plan from public.ads_meta_plans p
   where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then
    return query select 'not_found'::text, null::uuid, null::integer; return;
  end if;
  if v_plan.connection_id <> p_connection_id then
    return query select 'plan_not_ready'::text, null::uuid, null::integer; return;
  end if;
  if v_plan.version <> p_expected_version then
    return query select 'plan_changed'::text, null::uuid, v_plan.version; return;
  end if;
  -- Approval requires a validate-only pass of exactly this version; published/active plans cannot be re-approved.
  if v_plan.status not in ('validated', 'approved', 'failed', 'partial') or v_plan.validated_version is distinct from v_plan.version then
    return query select 'validation_required'::text, null::uuid, v_plan.version; return;
  end if;

  update public.ads_meta_plans
     set status = case when status = 'partial' then 'partial' else 'approved' end,
         plan_hash = p_plan_hash,
         approved_version = version,
         approved_at = pg_catalog.now(),
         approval_summary = p_approval_summary,
         failure_step = case when status = 'partial' then failure_step else null end,
         failure_code = case when status = 'partial' then failure_code else null end,
         failure_reason = case when status = 'partial' then failure_reason else null end
   where id = v_plan.id;

  insert into public.ads_meta_actions (user_id, plan_id, connection_id, actor, action_type, target, after_state, status, applied_at)
  values (p_user_id, v_plan.id, p_connection_id, 'user', 'meta_plan_approved',
          pg_catalog.jsonb_build_object('plan_version', v_plan.version, 'plan_hash', p_plan_hash),
          p_approval_summary, 'approved', pg_catalog.now())
  returning id into v_action_id;

  return query select 'approved'::text, v_action_id, v_plan.version;
end
$$;

revoke all on function public.ads_approve_meta_plan(uuid, uuid, integer, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.ads_approve_meta_plan(uuid, uuid, integer, uuid, text, jsonb) to service_role;

-- (e) Publish capacity (idempotent per request id; Google v2 pattern) ---------
-- p_daily_attempts_per_user: null falls back to 30 per 24 h. p_daily_attempts_global: null means unlimited.
create or replace function public.ads_reserve_meta_publish_capacity(
  p_user_id uuid,
  p_plan_id uuid,
  p_connection_id uuid,
  p_request_id uuid,
  p_daily_attempts_per_user integer,
  p_daily_attempts_global integer
)
returns table (state text, action_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_meta_plans%rowtype;
  v_existing public.ads_meta_actions%rowtype;
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
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('meta-ads-publish-global'));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('meta-ads-publish-user:' || p_user_id::text));

  select a.* into v_existing from public.ads_meta_actions a
   where a.user_id = p_user_id and a.action_type = 'meta_publish_attempt_reserved'
     and a.idempotency_key = p_request_id for update;
  if found then
    if v_existing.plan_id is distinct from p_plan_id or v_existing.connection_id is distinct from p_connection_id then
      return query select 'idempotency_conflict'::text, null::uuid; return;
    end if;
    return query select 'reserved'::text, v_existing.id; return;
  end if;

  select p.* into v_plan from public.ads_meta_plans p
   where p.id = p_plan_id and p.user_id = p_user_id for update;
  -- 'partial' is allowed so a retry can continue after a partly failed publish; 'published' never re-publishes.
  if not found or v_plan.connection_id is distinct from p_connection_id
    or v_plan.status not in ('approved', 'partial', 'failed')
    or v_plan.approved_version is distinct from v_plan.version
    or v_plan.meta_ad_id is not null then
    return query select 'plan_not_ready'::text, null::uuid; return;
  end if;

  select count(*) into v_user_attempts from public.ads_meta_actions a
   where a.user_id = p_user_id and a.action_type = 'meta_publish_attempt_reserved'
     and a.created_at >= pg_catalog.now() - interval '24 hours';
  if v_user_attempts >= v_user_limit then
    v_denial := 'user_publish_limit_reached';
  end if;

  if v_denial is null and p_daily_attempts_global is not null then
    select count(*) into v_global_attempts from public.ads_meta_actions a
     where a.action_type = 'meta_publish_attempt_reserved'
       and a.created_at >= pg_catalog.now() - interval '24 hours';
    if v_global_attempts >= p_daily_attempts_global then
      v_denial := 'global_publish_limit_reached';
    end if;
  end if;

  if v_denial is not null then
    insert into public.ads_meta_actions (user_id, plan_id, connection_id, actor, action_type, target, status)
    values (p_user_id, p_plan_id, p_connection_id, 'system', 'meta_publish_denied',
            pg_catalog.jsonb_build_object('reason', v_denial), 'failed');
    return query select v_denial, null::uuid; return;
  end if;

  insert into public.ads_meta_actions (
    user_id, plan_id, connection_id, actor, action_type, idempotency_key, target, status, applied_at
  ) values (
    p_user_id, p_plan_id, p_connection_id, 'system', 'meta_publish_attempt_reserved', p_request_id,
    pg_catalog.jsonb_build_object('plan_version', v_plan.version), 'applied', pg_catalog.now()
  ) returning id into v_action_id;

  update public.ads_meta_plans set status = 'publishing' where id = v_plan.id;

  return query select 'reserved'::text, v_action_id;
end
$$;

revoke all on function public.ads_reserve_meta_publish_capacity(uuid, uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ads_reserve_meta_publish_capacity(uuid, uuid, uuid, uuid, integer, integer)
  to service_role;

-- (f) Finish: one atomic write of the final plan state + audit row -----------
create or replace function public.ads_finish_meta_publish(
  p_user_id uuid,
  p_plan_id uuid,
  p_action_id uuid,
  p_outcome text,
  p_campaign_id text,
  p_adset_id text,
  p_image_hash text,
  p_creative_id text,
  p_ad_id text,
  p_failure_step text,
  p_failure_code text,
  p_failure_reason text
)
returns table (state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_meta_plans%rowtype;
begin
  if p_user_id is null or p_plan_id is null or p_action_id is null or p_outcome not in ('published', 'partial', 'failed') then
    return query select 'invalid_request'::text; return;
  end if;
  select p.* into v_plan from public.ads_meta_plans p where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then
    return query select 'not_found'::text; return;
  end if;
  if not exists (
    select 1 from public.ads_meta_actions a
     where a.id = p_action_id and a.user_id = p_user_id and a.plan_id = p_plan_id
       and a.action_type = 'meta_publish_attempt_reserved'
  ) then
    return query select 'invalid_request'::text; return;
  end if;

  update public.ads_meta_plans
     set status = p_outcome,
         meta_campaign_id = coalesce(p_campaign_id, meta_campaign_id),
         meta_adset_id = coalesce(p_adset_id, meta_adset_id),
         meta_image_hash = coalesce(p_image_hash, meta_image_hash),
         meta_creative_id = coalesce(p_creative_id, meta_creative_id),
         meta_ad_id = coalesce(p_ad_id, meta_ad_id),
         failure_step = case when p_outcome = 'published' then null else p_failure_step end,
         failure_code = case when p_outcome = 'published' then null else left(p_failure_code, 80) end,
         failure_reason = case when p_outcome = 'published' then null else left(p_failure_reason, 600) end,
         published_at = case when p_outcome = 'published' then pg_catalog.now() else published_at end
   where id = v_plan.id;

  insert into public.ads_meta_actions (user_id, plan_id, connection_id, actor, action_type, target, after_state, status, applied_at)
  values (p_user_id, v_plan.id, v_plan.connection_id, 'system', 'meta_publish_finished',
          pg_catalog.jsonb_build_object('attempt_action_id', p_action_id),
          pg_catalog.jsonb_build_object('outcome', p_outcome, 'failure_step', p_failure_step, 'failure_code', p_failure_code),
          case when p_outcome = 'failed' then 'failed' else 'applied' end, pg_catalog.now());

  return query select p_outcome;
end
$$;

revoke all on function public.ads_finish_meta_publish(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.ads_finish_meta_publish(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text)
  to service_role;

-- (g) Connection upgrade: same account + page, wider scopes, fresh token -----
-- Handled in application code through ads_save_meta_connection_with_limit (upsert by user + account id);
-- no new object is needed here.

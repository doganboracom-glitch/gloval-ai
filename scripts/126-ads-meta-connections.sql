-- UNAPPLIED DRAFT. Review and apply only through the approved migration workflow.
-- GLOVAL Ads / Meta (Facebook + Instagram), phase M1 = connect + read only.
-- Reuses live ads_connections / ads_google_insights_cache; defines only new objects.
-- Meta's long-lived token is stored encrypted in the existing refresh_token_enc column.

begin;

-- (a) ads_connections: Meta-specific nullable columns -----------------------
alter table public.ads_connections
  add column if not exists token_expires_at timestamptz,
  add column if not exists meta_business_id text,
  add column if not exists page_id text,
  add column if not exists page_name text,
  add column if not exists instagram_account_id text,
  add column if not exists instagram_account_name text,
  add column if not exists account_status integer,
  -- App-scoped Meta user id; required to map deauthorize/data-deletion callbacks to connections.
  add column if not exists meta_user_id text;

create index if not exists ads_connections_meta_user_idx
  on public.ads_connections (meta_user_id)
  where platform = 'meta' and meta_user_id is not null;

create index if not exists ads_connections_meta_expiry_idx
  on public.ads_connections (token_expires_at)
  where platform = 'meta' and status = 'active';

-- (b) OAuth flows -----------------------------------------------------------
create table if not exists public.ads_meta_oauth_flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'started'
    check (status in ('started', 'awaiting_account', 'completed')),
  pending_token_enc text,
  pending_token_key_version smallint check (pending_token_key_version is null or pending_token_key_version > 0),
  pending_token_expires_at timestamptz,
  pending_meta_user_id text,
  granted_scopes text[] not null default '{}',
  account_candidates jsonb not null default '[]'::jsonb
    check (jsonb_typeof(account_candidates) = 'array'),
  page_candidates jsonb not null default '[]'::jsonb
    check (jsonb_typeof(page_candidates) = 'array'),
  state_consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint ads_meta_oauth_flow_stage_check check (
    (status = 'started'
      and state_consumed_at is null
      and pending_token_enc is null)
    or
    (status = 'awaiting_account'
      and state_consumed_at is not null
      and pending_token_enc is not null
      and pending_token_key_version is not null)
    or
    (status = 'completed'
      and state_consumed_at is not null
      and pending_token_enc is null)
  )
);

create index if not exists ads_meta_oauth_flows_owner_expiry_idx
  on public.ads_meta_oauth_flows (user_id, expires_at);
create index if not exists ads_meta_oauth_flows_expiry_idx
  on public.ads_meta_oauth_flows (expires_at);

alter table public.ads_meta_oauth_flows enable row level security;
alter table public.ads_meta_oauth_flows force row level security;
revoke all on table public.ads_meta_oauth_flows from public, anon, authenticated;
grant select, insert, update, delete on table public.ads_meta_oauth_flows to service_role;

-- (c) Graph API operation counter -------------------------------------------
create table if not exists public.ads_meta_api_operations (
  request_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  connection_id uuid references public.ads_connections(id) on delete set null,
  endpoint text not null check (
    endpoint in (
      'me.adaccounts',
      'me.accounts',
      'act.account',
      'act.instagram_accounts',
      'act.insights',
      'act.campaigns',
      'debug_token',
      'oauth.token',
      'me.permissions'
    )
  ),
  outcome text not null default 'reserved'
    check (outcome in ('reserved', 'success', 'error')),
  safe_error_code text check (
    safe_error_code is null
    or safe_error_code in (
      'reauth_required',
      'permission_missing',
      'rate_limited',
      'provider_error',
      'network_error'
    )
  ),
  created_at timestamptz not null default now()
);

create index if not exists ads_meta_api_operations_created_idx
  on public.ads_meta_api_operations (created_at);
create index if not exists ads_meta_api_operations_user_created_idx
  on public.ads_meta_api_operations (user_id, created_at);

alter table public.ads_meta_api_operations enable row level security;
alter table public.ads_meta_api_operations force row level security;
revoke all on table public.ads_meta_api_operations from public, anon, authenticated;
grant select, insert, update, delete on table public.ads_meta_api_operations to service_role;

-- Data-deletion callback receipts (status page: /yasal/veri-silme?code=...).
create table if not exists public.ads_meta_data_deletions (
  confirmation_code text primary key check (confirmation_code ~ '^[a-f0-9]{32}$'),
  revoked_connections integer not null default 0 check (revoked_connections >= 0),
  created_at timestamptz not null default now()
);

alter table public.ads_meta_data_deletions enable row level security;
alter table public.ads_meta_data_deletions force row level security;
revoke all on table public.ads_meta_data_deletions from public, anon, authenticated;
grant select, insert, update, delete on table public.ads_meta_data_deletions to service_role;

-- Sliding 24h read quota. Retention is 16 days (not 25h) so ads_meta_api_calls_15d() has data;
-- the 24h window is enforced by the created_at filters below.
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
  v_global_used integer;
  v_user_used integer;
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'request and user ids are required';
  end if;
  if p_endpoint is null or p_endpoint not in (
    'me.adaccounts', 'me.accounts', 'act.account', 'act.instagram_accounts', 'act.insights', 'act.campaigns',
    'debug_token', 'oauth.token', 'me.permissions'
  ) then
    raise exception 'unsupported Meta API endpoint';
  end if;
  if p_user_daily_limit is null or p_user_daily_limit < 1 or p_user_daily_limit > 100000
    or p_global_daily_limit is null or p_global_daily_limit < 1 or p_global_daily_limit > 100000 then
    raise exception 'Meta read limits must be between 1 and 100000';
  end if;
  if p_connection_id is not null and not exists (
    select 1
      from public.ads_connections c
     where c.id = p_connection_id
       and c.user_id = p_user_id
       and c.platform = 'meta'
       and c.status = 'active'
  ) then
    raise exception 'Meta connection does not belong to user';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('gloval-meta-ads-project-quota')::bigint
  );

  delete from public.ads_meta_api_operations
   where created_at < v_now - interval '16 days';

  select count(*)::integer
    into v_global_used
    from public.ads_meta_api_operations o
   where o.created_at >= v_window_start;

  select count(*)::integer
    into v_user_used
    from public.ads_meta_api_operations o
   where o.user_id = p_user_id
     and o.created_at >= v_window_start;

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

-- Successful Graph calls in the last 15 days (Meta Full Access threshold: 500), admin panel only.
create or replace function public.ads_meta_api_calls_15d()
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)::integer
    from public.ads_meta_api_operations o
   where o.outcome = 'success'
     and o.created_at >= pg_catalog.clock_timestamp() - interval '15 days'
$$;

revoke all on function public.ads_meta_api_calls_15d() from public, anon, authenticated;
grant execute on function public.ads_meta_api_calls_15d() to service_role;

-- Atomic save with the per-user active connection limit.
create or replace function public.ads_save_meta_connection_with_limit(
  p_user_id uuid,
  p_external_account_id text,
  p_external_account_name text,
  p_currency_code text,
  p_token_enc text,
  p_token_key_version smallint,
  p_scopes text[],
  p_token_expires_at timestamptz,
  p_meta_user_id text,
  p_meta_business_id text,
  p_page_id text,
  p_page_name text,
  p_instagram_account_id text,
  p_instagram_account_name text,
  p_account_status integer,
  p_max_active_connections integer
)
returns table (allowed boolean, connection_id uuid, active_count integer, error_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_status text;
  v_active_count integer;
  v_connection_id uuid;
begin
  if p_user_id is null
    or p_external_account_id is null
    or p_external_account_id !~ '^act_[0-9]{5,25}$'
    or p_token_enc is null
    or pg_catalog.length(pg_catalog.btrim(p_token_enc)) = 0
    or p_token_key_version is null
    or p_token_expires_at is null
    or p_scopes is null
    or not p_scopes @> array['ads_read']::text[]
    or (p_currency_code is not null and p_currency_code !~ '^[A-Z]{3}$')
    or (p_meta_user_id is not null and p_meta_user_id !~ '^[0-9]{1,30}$') then
    raise exception 'invalid Meta connection data';
  end if;
  if p_max_active_connections is null or p_max_active_connections < 1 or p_max_active_connections > 100 then
    raise exception 'Meta connection limit must be between 1 and 100';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('gloval-meta-ads-user-connections:' || p_user_id::text)::bigint
  );

  select c.status
    into v_existing_status
    from public.ads_connections c
   where c.user_id = p_user_id
     and c.platform = 'meta'
     and c.external_account_id = p_external_account_id
   for update;

  select count(*)::integer
    into v_active_count
    from public.ads_connections c
   where c.user_id = p_user_id
     and c.platform = 'meta'
     and c.status = 'active';

  if v_existing_status is distinct from 'active' and v_active_count >= p_max_active_connections then
    return query select false, null::uuid, v_active_count, 'connection_limit_exceeded'::text;
    return;
  end if;

  insert into public.ads_connections (
    user_id, platform, external_account_id, external_account_name,
    refresh_token_enc, token_key_version, scopes, status, last_error,
    currency_code, is_manager, token_expires_at, meta_user_id, meta_business_id,
    page_id, page_name, instagram_account_id, instagram_account_name, account_status
  ) values (
    p_user_id, 'meta', p_external_account_id, p_external_account_name,
    p_token_enc, p_token_key_version, p_scopes, 'active', null,
    p_currency_code, false, p_token_expires_at, p_meta_user_id, p_meta_business_id,
    p_page_id, p_page_name, p_instagram_account_id, p_instagram_account_name, p_account_status
  )
  on conflict (user_id, platform, external_account_id) do update
    set external_account_name = excluded.external_account_name,
        refresh_token_enc = excluded.refresh_token_enc,
        token_key_version = excluded.token_key_version,
        scopes = excluded.scopes,
        status = 'active',
        last_error = null,
        currency_code = excluded.currency_code,
        token_expires_at = excluded.token_expires_at,
        meta_user_id = excluded.meta_user_id,
        meta_business_id = excluded.meta_business_id,
        page_id = excluded.page_id,
        page_name = excluded.page_name,
        instagram_account_id = excluded.instagram_account_id,
        instagram_account_name = excluded.instagram_account_name,
        account_status = excluded.account_status
  returning id into v_connection_id;

  select count(*)::integer
    into v_active_count
    from public.ads_connections c
   where c.user_id = p_user_id
     and c.platform = 'meta'
     and c.status = 'active';

  return query select true, v_connection_id, v_active_count, null::text;
end
$$;

revoke all on function public.ads_save_meta_connection_with_limit(
  uuid, text, text, text, text, smallint, text[], timestamptz, text, text, text, text, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.ads_save_meta_connection_with_limit(
  uuid, text, text, text, text, smallint, text[], timestamptz, text, text, text, text, text, text, integer, integer
) to service_role;

-- Meta callbacks (deauthorize / data deletion): revoke every GLOVAL connection of one Meta user
-- and drop the stored token. p_confirmation_code (nullable) records a data-deletion receipt.
create or replace function public.ads_revoke_meta_user_connections(
  p_meta_user_id text,
  p_confirmation_code text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_meta_user_id is null or p_meta_user_id !~ '^[0-9]{1,30}$' then
    raise exception 'invalid Meta user id';
  end if;
  if p_confirmation_code is not null and p_confirmation_code !~ '^[a-f0-9]{32}$' then
    raise exception 'invalid confirmation code';
  end if;

  with revoked as (
    update public.ads_connections c
       set status = 'revoked',
           refresh_token_enc = null,
           token_expires_at = null,
           last_error = null
     where c.platform = 'meta'
       and c.meta_user_id = p_meta_user_id
       and (c.status <> 'revoked' or c.refresh_token_enc is not null)
    returning c.id
  )
  select count(*)::integer into v_count from revoked;

  delete from public.ads_meta_oauth_flows f
   where f.pending_meta_user_id = p_meta_user_id;

  if p_confirmation_code is not null then
    insert into public.ads_meta_data_deletions (confirmation_code, revoked_connections)
    values (p_confirmation_code, v_count)
    on conflict (confirmation_code) do nothing;
  end if;

  return v_count;
end
$$;

revoke all on function public.ads_revoke_meta_user_connections(text, text)
  from public, anon, authenticated;
grant execute on function public.ads_revoke_meta_user_connections(text, text) to service_role;

commit;

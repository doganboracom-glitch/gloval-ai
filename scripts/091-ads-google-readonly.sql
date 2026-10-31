begin;

alter table public.ads_connections
  add column currency_code text,
  add column is_manager boolean not null default false,
  add column api_lease_id uuid,
  add column api_lease_expires_at timestamptz,
  add constraint ads_connections_currency_code_check
    check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  add constraint ads_connections_api_lease_pair_check
    check ((api_lease_id is null) = (api_lease_expires_at is null));

create table public.ads_google_oauth_flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  code_verifier_enc text,
  pending_refresh_token_enc text,
  status text not null default 'started'
    check (status in ('started', 'exchanging', 'awaiting_account')),
  account_candidates jsonb not null default '[]'::jsonb
    check (jsonb_typeof(account_candidates) = 'array'),
  scopes text[] not null default '{}',
  state_consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint ads_google_oauth_flow_stage_check check (
    (status = 'started'
      and state_consumed_at is null
      and code_verifier_enc is not null
      and pending_refresh_token_enc is null)
    or
    (status = 'exchanging'
      and state_consumed_at is not null
      and code_verifier_enc is not null
      and pending_refresh_token_enc is null)
    or
    (status = 'awaiting_account'
      and state_consumed_at is not null
      and code_verifier_enc is null
      and pending_refresh_token_enc is not null)
  )
);

create index ads_google_oauth_flows_owner_expiry_idx
  on public.ads_google_oauth_flows (user_id, expires_at);
create index ads_google_oauth_flows_expiry_idx
  on public.ads_google_oauth_flows (expires_at);

alter table public.ads_google_oauth_flows enable row level security;
revoke all on table public.ads_google_oauth_flows from public, anon, authenticated;
grant select, insert, update, delete on table public.ads_google_oauth_flows to service_role;

create table public.ads_google_api_operations (
  request_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  connection_id uuid references public.ads_connections(id) on delete set null,
  method text not null check (
    method in (
      'customers.listAccessibleCustomers',
      'googleAds.search',
      'googleAds.searchStream'
    )
  ),
  outcome text not null default 'reserved'
    check (outcome in ('reserved', 'success', 'error')),
  safe_error_code text check (
    safe_error_code is null
    or safe_error_code in ('rate_limited', 'provider_unavailable', 'provider_rejected', 'network_error')
  ),
  created_at timestamptz not null default now()
);

create index ads_google_api_operations_created_idx
  on public.ads_google_api_operations (created_at);
create index ads_google_api_operations_user_created_idx
  on public.ads_google_api_operations (user_id, created_at);

alter table public.ads_google_api_operations enable row level security;
revoke all on table public.ads_google_api_operations from public, anon, authenticated;
grant select, insert, update, delete on table public.ads_google_api_operations to service_role;

create or replace function public.ads_reserve_google_api_operation(
  p_request_id uuid,
  p_user_id uuid,
  p_connection_id uuid,
  p_method text
)
returns table (allowed boolean, global_used integer, user_used integer)
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
  if p_method not in (
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

  select count(*)::integer
    into v_global_used
    from public.ads_google_api_operations o
   where o.created_at >= v_now - interval '24 hours';

  select count(*)::integer
    into v_user_used
    from public.ads_google_api_operations o
   where o.user_id = p_user_id
     and o.created_at >= v_now - interval '24 hours';

  if v_global_used >= 2400 or v_user_used >= 120 then
    return query select false, v_global_used, v_user_used;
    return;
  end if;

  insert into public.ads_google_api_operations (request_id, user_id, connection_id, method)
  values (p_request_id, p_user_id, p_connection_id, p_method);

  return query select true, v_global_used + 1, v_user_used + 1;
end
$$;

revoke all on function public.ads_reserve_google_api_operation(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.ads_reserve_google_api_operation(uuid, uuid, uuid, text)
  to service_role;

create or replace function public.ads_purge_expired(
  p_free_usage_days  integer default 14,
  p_reservation_days integer default 7,
  p_anon_hash_days   integer default 30,
  p_usage_days       integer default 400,
  p_alert_days       integer default 90,
  p_batch            integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today       date := (pg_catalog.now() at time zone 'Europe/Istanbul')::date;
  n_free        integer;
  n_res         integer;
  n_hash        integer;
  n_usage       integer;
  n_alert       integer;
  n_oauth       integer;
  n_google_ops  integer;
begin
  if p_free_usage_days < 1 or p_reservation_days < 1 or p_anon_hash_days < 1
     or p_usage_days < 1 or p_alert_days < 1 then
    raise exception 'retention periods must be at least 1 day';
  end if;
  if p_batch < 1 or p_batch > 50000 then
    raise exception 'batch must be between 1 and 50000';
  end if;

  delete from public.ads_free_usage
   where ctid in (
     select f.ctid
       from public.ads_free_usage f
      where f.day < v_today - p_free_usage_days
      limit p_batch
   );
  get diagnostics n_free = row_count;

  delete from public.ads_free_reservations
   where ctid in (
     select r.ctid
       from public.ads_free_reservations r
      where r.created_at < pg_catalog.now() - pg_catalog.make_interval(days => p_reservation_days)
      limit p_batch
   );
  get diagnostics n_res = row_count;

  update public.ads_usage_events
     set anon_subject_hash = null
   where ctid in (
     select e.ctid
       from public.ads_usage_events e
      where e.anon_subject_hash is not null
        and e.created_at < pg_catalog.now() - pg_catalog.make_interval(days => p_anon_hash_days)
      limit p_batch
   );
  get diagnostics n_hash = row_count;

  delete from public.ads_usage_events
   where ctid in (
     select e.ctid
       from public.ads_usage_events e
      where e.created_at < pg_catalog.now() - pg_catalog.make_interval(days => p_usage_days)
      limit p_batch
   );
  get diagnostics n_usage = row_count;

  delete from public.ads_alerts
   where ctid in (
     select a.ctid
       from public.ads_alerts a
      where a.day < v_today - p_alert_days
      limit p_batch
   );
  get diagnostics n_alert = row_count;

  delete from public.ads_google_oauth_flows
   where ctid in (
     select f.ctid
       from public.ads_google_oauth_flows f
      where f.expires_at < pg_catalog.now()
      limit p_batch
   );
  get diagnostics n_oauth = row_count;

  delete from public.ads_google_api_operations
   where ctid in (
     select o.ctid
       from public.ads_google_api_operations o
      where o.created_at < pg_catalog.now() - interval '25 hours'
      limit p_batch
   );
  get diagnostics n_google_ops = row_count;

  return pg_catalog.jsonb_build_object(
    'free_usage', n_free,
    'reservations', n_res,
    'anon_hashes', n_hash,
    'usage_events', n_usage,
    'alerts', n_alert,
    'google_oauth_flows', n_oauth,
    'google_api_operations', n_google_ops,
    'batch', p_batch
  );
end
$$;

revoke all on function public.ads_purge_expired(integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ads_purge_expired(integer, integer, integer, integer, integer, integer)
  to service_role;

commit;

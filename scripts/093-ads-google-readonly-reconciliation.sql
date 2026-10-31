-- APPLIED to production as supabase migration ads_google_readonly_source_reconciliation (20261031142928); recorded for repo/db parity, do not re-run

begin;
set local search_path = pg_catalog;

alter table public.ads_connections
  add column if not exists currency_code text,
  add column if not exists is_manager boolean not null default false,
  add column if not exists api_lease_id uuid,
  add column if not exists api_lease_expires_at timestamptz;

update public.ads_connections
set is_manager = false
where is_manager is null;
alter table public.ads_connections
  alter column is_manager set default false,
  alter column is_manager set not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.ads_connections'::regclass
      and conname = 'ads_connections_currency_code_check'
  ) then
    alter table public.ads_connections
      add constraint ads_connections_currency_code_check
      check (currency_code is null or currency_code ~ '^[A-Z]{3}$');
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.ads_connections'::regclass
      and conname = 'ads_connections_api_lease_pair_check'
  ) then
    alter table public.ads_connections
      add constraint ads_connections_api_lease_pair_check
      check ((api_lease_id is null) = (api_lease_expires_at is null));
  end if;
end;
$$;

create table if not exists public.ads_google_oauth_flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  code_verifier_enc text,
  pending_refresh_token_enc text,
  token_key_version smallint not null default 1 check (token_key_version > 0),
  account_candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(account_candidates) = 'array'),
  status text not null default 'started'
    check (status in ('started', 'exchanging', 'awaiting_account', 'completed')),
  state_consumed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  constraint ads_google_oauth_flow_stage_check check (
    (status = 'started' and state_consumed_at is null and code_verifier_enc is not null and pending_refresh_token_enc is null)
    or (status = 'exchanging' and state_consumed_at is not null and code_verifier_enc is not null and pending_refresh_token_enc is null)
    or (status = 'awaiting_account' and state_consumed_at is not null and code_verifier_enc is null and pending_refresh_token_enc is not null)
    or (status = 'completed' and state_consumed_at is not null and code_verifier_enc is null and pending_refresh_token_enc is null)
  )
);

create table if not exists public.ads_google_api_operations (
  request_id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  connection_id uuid references public.ads_connections(id) on delete set null,
  method text not null check (method in (
    'customers.listAccessibleCustomers',
    'googleAds.search',
    'googleAds.searchStream'
  )),
  outcome text not null default 'reserved' check (outcome in ('reserved', 'success', 'error')),
  safe_error_code text check (safe_error_code is null or safe_error_code in (
    'rate_limited',
    'provider_unavailable',
    'provider_rejected',
    'network_error'
  )),
  created_at timestamptz not null default now()
);

alter table public.ads_google_oauth_flows
  drop constraint if exists ads_google_oauth_flows_status_check;
alter table public.ads_google_oauth_flows
  add constraint ads_google_oauth_flows_status_check
  check (status in ('started', 'exchanging', 'awaiting_account', 'completed'));
alter table public.ads_google_oauth_flows
  drop constraint if exists ads_google_oauth_flow_stage_check;
alter table public.ads_google_oauth_flows
  add constraint ads_google_oauth_flow_stage_check check (
    (status = 'started' and state_consumed_at is null and code_verifier_enc is not null and pending_refresh_token_enc is null)
    or (status = 'exchanging' and state_consumed_at is not null and code_verifier_enc is not null and pending_refresh_token_enc is null)
    or (status = 'awaiting_account' and state_consumed_at is not null and code_verifier_enc is null and pending_refresh_token_enc is not null)
    or (status = 'completed' and state_consumed_at is not null and code_verifier_enc is null and pending_refresh_token_enc is null)
  );

create index if not exists ads_google_oauth_flows_expiry_idx
  on public.ads_google_oauth_flows (expires_at);
create index if not exists ads_google_oauth_flows_owner_expiry_idx
  on public.ads_google_oauth_flows (user_id, expires_at);
create index if not exists ads_google_api_operations_created_idx
  on public.ads_google_api_operations (created_at);
create index if not exists ads_google_api_operations_user_created_idx
  on public.ads_google_api_operations (user_id, created_at);

alter table public.ads_connections enable row level security;
alter table public.ads_google_oauth_flows enable row level security;
alter table public.ads_google_api_operations enable row level security;

revoke all on table public.ads_connections from public, anon, authenticated;
revoke all on table public.ads_google_oauth_flows from public, anon, authenticated;
revoke all on table public.ads_google_api_operations from public, anon, authenticated;
grant select, insert, update, delete on table public.ads_connections to service_role;
grant select, insert, update, delete on table public.ads_google_oauth_flows to service_role;
grant select, insert, update, delete on table public.ads_google_api_operations to service_role;

create or replace function public.ads_reserve_google_api_operation(
  p_request_id uuid,
  p_user_id uuid,
  p_connection_id uuid,
  p_method text
)
returns table(allowed boolean, global_used integer, user_used integer)
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
  if p_method is null or p_method not in (
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
end;
$$;

revoke all on function public.ads_reserve_google_api_operation(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.ads_reserve_google_api_operation(uuid, uuid, uuid, text)
  to service_role;

do $$
declare
  v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'ads_%'
      and p.prokind = 'f'
  loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated',
      v_signature
    );
    execute pg_catalog.format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$$;

commit;

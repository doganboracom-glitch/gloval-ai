-- UNAPPLIED DRAFT. Review and apply only through the approved migration workflow.
-- Extends the existing ads_google_api_operations counter; it does not create a new quota table.

begin;

drop function if exists public.ads_reserve_google_api_operation(uuid, uuid, uuid, text);

create or replace function public.ads_reserve_google_api_operation(
  p_request_id uuid,
  p_user_id uuid,
  p_connection_id uuid,
  p_method text,
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
  if p_method is null or p_method not in (
    'customers.listAccessibleCustomers',
    'googleAds.search',
    'googleAds.searchStream'
  ) then
    raise exception 'unsupported Google Ads API method';
  end if;
  if p_user_daily_limit is null or p_user_daily_limit < 1 or p_user_daily_limit > 2879
    or p_global_daily_limit is null or p_global_daily_limit < 1 or p_global_daily_limit > 2879 then
    raise exception 'Google Ads read limits must be between 1 and 2879';
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
   where o.method in (
       'customers.listAccessibleCustomers',
       'googleAds.search',
       'googleAds.searchStream'
     )
     and o.created_at >= v_window_start;

  select count(*)::integer
    into v_user_used
    from public.ads_google_api_operations o
   where o.user_id = p_user_id
     and o.method in (
       'customers.listAccessibleCustomers',
       'googleAds.search',
       'googleAds.searchStream'
     )
     and o.created_at >= v_window_start;

  if v_global_used >= p_global_daily_limit or v_user_used >= p_user_daily_limit then
    return query select false, v_global_used, v_user_used;
    return;
  end if;

  insert into public.ads_google_api_operations (request_id, user_id, connection_id, method)
  values (p_request_id, p_user_id, p_connection_id, p_method);

  return query select true, v_global_used + 1, v_user_used + 1;
end
$$;

revoke all on function public.ads_reserve_google_api_operation(uuid, uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ads_reserve_google_api_operation(uuid, uuid, uuid, text, integer, integer)
  to service_role;

create or replace function public.ads_save_google_ads_connection_with_limit(
  p_user_id uuid,
  p_external_account_id text,
  p_external_account_name text,
  p_login_customer_id text,
  p_currency_code text,
  p_refresh_token_enc text,
  p_token_key_version smallint,
  p_scopes text[],
  p_max_active_connections integer
)
returns table (allowed boolean, connection_id uuid, active_count integer, error_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing_id uuid;
  v_existing_status text;
  v_existing_lease_expires_at timestamptz;
  v_active_count integer;
  v_connection_id uuid;
begin
  if p_user_id is null
    or p_external_account_id is null
    or p_external_account_id !~ '^[0-9]{6,20}$'
    or p_refresh_token_enc is null
    or pg_catalog.length(pg_catalog.btrim(p_refresh_token_enc)) = 0
    or p_token_key_version is null
    or p_scopes is null
    or not p_scopes @> array['https://www.googleapis.com/auth/adwords']::text[]
    or (p_login_customer_id is not null and p_login_customer_id !~ '^[0-9]{6,20}$')
    or (p_currency_code is not null and p_currency_code !~ '^[A-Z]{3}$') then
    raise exception 'invalid Google Ads connection data';
  end if;
  if p_max_active_connections is null or p_max_active_connections < 1 or p_max_active_connections > 100 then
    raise exception 'Google Ads connection limit must be between 1 and 100';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('gloval-google-ads-user-connections:' || p_user_id::text)::bigint
  );

  select c.id, c.status, c.api_lease_expires_at
    into v_existing_id, v_existing_status, v_existing_lease_expires_at
    from public.ads_connections c
   where c.user_id = p_user_id
     and c.platform = 'google_ads'
     and c.external_account_id = p_external_account_id
   for update;

  if v_existing_lease_expires_at is not null and v_existing_lease_expires_at > v_now then
    return query select false, null::uuid, 0, 'connection_busy'::text;
    return;
  end if;

  select count(*)::integer
    into v_active_count
    from public.ads_connections c
   where c.user_id = p_user_id
     and c.platform = 'google_ads'
     and c.status = 'active';

  if v_existing_status is distinct from 'active' and v_active_count >= p_max_active_connections then
    return query select false, null::uuid, v_active_count, 'connection_limit_exceeded'::text;
    return;
  end if;

  insert into public.ads_connections (
    user_id,
    platform,
    external_account_id,
    external_account_name,
    login_customer_id,
    refresh_token_enc,
    token_key_version,
    scopes,
    status,
    last_error,
    currency_code,
    is_manager
  ) values (
    p_user_id,
    'google_ads',
    p_external_account_id,
    p_external_account_name,
    p_login_customer_id,
    p_refresh_token_enc,
    p_token_key_version,
    p_scopes,
    'active',
    null,
    p_currency_code,
    false
  )
  on conflict (user_id, platform, external_account_id) do update
    set external_account_name = excluded.external_account_name,
        login_customer_id = excluded.login_customer_id,
        refresh_token_enc = excluded.refresh_token_enc,
        token_key_version = excluded.token_key_version,
        scopes = excluded.scopes,
        status = 'active',
        last_error = null,
        currency_code = excluded.currency_code,
        is_manager = false
  returning id into v_connection_id;

  select count(*)::integer
    into v_active_count
    from public.ads_connections c
   where c.user_id = p_user_id
     and c.platform = 'google_ads'
     and c.status = 'active';

  return query select true, v_connection_id, v_active_count, null::text;
end
$$;

revoke all on function public.ads_save_google_ads_connection_with_limit(
  uuid, text, text, text, text, text, smallint, text[], integer
) from public, anon, authenticated;
grant execute on function public.ads_save_google_ads_connection_with_limit(
  uuid, text, text, text, text, text, smallint, text[], integer
) to service_role;

commit;

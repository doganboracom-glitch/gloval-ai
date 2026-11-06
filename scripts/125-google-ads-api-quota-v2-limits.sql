-- DRAFT ONLY: review and apply explicitly. This file has not been run against the live database.
--
-- Scope: only the per-user rolling 24-hour limits inside ads_reserve_google_api_operation_v2.
--   * per-user write (googleAds.mutate / ads.mutateAds) operations: 100 -> 300
--   * per-user read (geoTargetConstants.suggest) operations:         80  -> 200
-- A plan validation and a publish each consume ~31-34 operations, so the previous limits
-- allowed only one validation plus one publish per user per day.
--
-- Unchanged on purpose: signature, return type, security definer, search_path = '',
-- the per-call operation_count range (1..100), the project-wide limits (2400 total,
-- 1200 write, 1200 read), the advisory lock, history purge and service_role-only execute.

begin;

create or replace function public.ads_reserve_google_api_operation_v2(
  p_request_id uuid,
  p_user_id uuid,
  p_connection_id uuid,
  p_method text,
  p_operation_count integer
)
returns table(allowed boolean, global_used integer, user_used integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_global_used integer;
  v_global_bucket_used integer;
  v_user_used integer;
  v_is_write boolean;
begin
  if p_request_id is null or p_user_id is null then raise exception 'request and user ids are required'; end if;
  v_is_write := p_method in ('googleAds.mutate', 'ads.mutateAds');
  if p_method is null or p_method not in ('googleAds.mutate', 'ads.mutateAds', 'geoTargetConstants.suggest') then
    raise exception 'unsupported Google Ads API method';
  end if;
  if p_operation_count is null or p_operation_count not between 1 and 100 then
    raise exception 'Google Ads operation count is out of range';
  end if;
  if p_connection_id is null or not exists (
    select 1 from public.ads_connections c where c.id = p_connection_id
      and c.user_id = p_user_id and c.platform = 'google_ads' and c.status = 'active'
  ) then raise exception 'Google Ads connection does not belong to user'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gloval-google-ads-project-quota')::bigint);
  delete from public.ads_google_api_operations where created_at < v_now - interval '25 hours';
  select coalesce(sum(o.operation_count), 0)::integer into v_global_used
    from public.ads_google_api_operations o where o.created_at >= v_now - interval '24 hours';
  select coalesce(sum(o.operation_count), 0)::integer into v_global_bucket_used
    from public.ads_google_api_operations o
   where o.method in ('googleAds.mutate', 'ads.mutateAds') and o.created_at >= v_now - interval '24 hours';
  select coalesce(sum(o.operation_count), 0)::integer into v_user_used
    from public.ads_google_api_operations o where o.user_id = p_user_id
      and ((v_is_write and o.method in ('googleAds.mutate', 'ads.mutateAds'))
        or (not v_is_write and o.method not in ('googleAds.mutate', 'ads.mutateAds')))
      and o.created_at >= v_now - interval '24 hours';

  if v_global_used + p_operation_count > 2400
    or (v_is_write and (v_global_bucket_used + p_operation_count > 1200 or v_user_used + p_operation_count > 300))
    or (not v_is_write and (v_global_used - v_global_bucket_used + p_operation_count > 1200 or v_user_used + p_operation_count > 200)) then
    return query select false, v_global_used, v_user_used; return;
  end if;
  insert into public.ads_google_api_operations (request_id, user_id, connection_id, method, operation_count)
  values (p_request_id, p_user_id, p_connection_id, p_method, p_operation_count);
  return query select true, v_global_used + p_operation_count, v_user_used + p_operation_count;
end
$$;

revoke all on function public.ads_reserve_google_api_operation_v2(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.ads_reserve_google_api_operation_v2(uuid, uuid, uuid, text, integer) to service_role;

commit;

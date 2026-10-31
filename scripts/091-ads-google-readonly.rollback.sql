begin;

-- Completed flows contain no credentials; remove them before restoring the original stage constraints.
delete from public.ads_google_oauth_flows
where status = 'completed';

alter table public.ads_google_oauth_flows
  drop constraint if exists ads_google_oauth_flow_stage_check;
alter table public.ads_google_oauth_flows
  add constraint ads_google_oauth_flow_stage_check check (
    (status = 'started' and state_consumed_at is null and code_verifier_enc is not null and pending_refresh_token_enc is null)
    or (status = 'exchanging' and state_consumed_at is not null and code_verifier_enc is not null and pending_refresh_token_enc is null)
    or (status = 'awaiting_account' and state_consumed_at is not null and code_verifier_enc is null and pending_refresh_token_enc is not null)
  );
alter table public.ads_google_oauth_flows
  drop constraint if exists ads_google_oauth_flows_status_check;
alter table public.ads_google_oauth_flows
  add constraint ads_google_oauth_flows_status_check
  check (status in ('started', 'exchanging', 'awaiting_account'));

revoke all on function public.ads_reserve_google_api_operation(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
drop function if exists public.ads_reserve_google_api_operation(uuid, uuid, uuid, text);

revoke all on table public.ads_google_api_operations from public, anon, authenticated, service_role;
revoke all on table public.ads_google_oauth_flows from public, anon, authenticated, service_role;
drop table if exists public.ads_google_api_operations;
drop table if exists public.ads_google_oauth_flows;

alter table public.ads_connections
  drop constraint if exists ads_connections_currency_code_check,
  drop constraint if exists ads_connections_api_lease_pair_check,
  drop column if exists currency_code,
  drop column if exists is_manager,
  drop column if exists api_lease_id,
  drop column if exists api_lease_expires_at;

commit;

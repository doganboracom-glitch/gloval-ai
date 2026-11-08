-- UNAPPLIED DRAFT. Rollback for 131-ads-meta-publish-credits.sql.
-- Run only through the approved migration workflow. Order matters: functions first, then the table.
--
-- WARNING: dropping ads_meta_publish_credit_reservations discards open holds. Before running, make sure no
-- Meta publish is in progress (no ads_meta_plans row in status 'publishing') and review any row still in
-- status 'reserved' for a published plan (a pending charge that was never settled). Charges already written to
-- ai_credit_transactions (reason 'ads:publish:<request_id>') and ads_meta_actions audit rows are NOT touched.

drop function if exists public.ads_finish_meta_publish_v2(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text);
drop function if exists public.ads_settle_meta_publish_credit(uuid, uuid);
drop function if exists public.ads_reserve_meta_publish_credits(uuid, uuid, uuid, uuid, integer, integer);
drop function if exists public.ads_meta_publish_credit_balance(uuid);

-- Restore the Google-only ads_charge_credits from scripts/106 (same security properties).
create or replace function public.ads_charge_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text
)
returns table (ok boolean, balance integer, already_charged boolean, charged_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_existing integer;
  v_reserved integer;
  v_exclude_request text;
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000 then
    raise exception 'amount must be between 1 and 1000';
  end if;
  if p_reason is null or p_reason !~ '^ads:[a-z_]{1,32}:[A-Za-z0-9_-]{8,128}$' then
    raise exception 'reason must match ads:<action>:<requestId>';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));
  select coalesce(sum(t.amount), 0)::integer into v_balance
    from public.ai_credit_transactions t where t.user_id = p_user_id;
  select -t.amount into v_existing
    from public.ai_credit_transactions t
   where t.user_id = p_user_id and t.reason = p_reason and t.amount < 0 limit 1;
  if v_existing is not null then
    return query select true, v_balance, true, v_existing;
    return;
  end if;

  v_exclude_request := case when p_reason like 'ads:publish:%'
    then pg_catalog.split_part(p_reason, ':', 3) else null end;
  select coalesce(sum(r.amount), 0)::integer into v_reserved
    from public.ads_google_publish_credit_reservations r
   where r.user_id = p_user_id and r.status = 'reserved'
     and (v_exclude_request is null or r.request_id::text <> v_exclude_request);
  if v_balance - v_reserved < p_amount then
    return query select false, greatest(v_balance - v_reserved, 0), false, 0;
    return;
  end if;

  insert into public.ai_credit_transactions (user_id, kind, amount, reason)
  values (p_user_id, 'usage', -p_amount, p_reason);
  return query select true, v_balance - p_amount, false, p_amount;
end
$$;

revoke all on function public.ads_charge_credits(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.ads_charge_credits(uuid, integer, text) to service_role;

drop table if exists public.ads_meta_publish_credit_reservations;

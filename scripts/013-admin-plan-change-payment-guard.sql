-- 013: move the "live PSP subscription" guard INTO admin_change_user_plan.
--
-- Before: the server action read billing_subscriptions, decided whether the
-- subscription was provider-backed, and only then called the RPC. A webhook (or
-- another request) could activate a provider subscription between that read and
-- the RPC's own UPDATE, so the plan could change without the acknowledgement.
--
-- After: the check happens in the same transaction as the update, on the row
-- locked with FOR UPDATE (plus the per-user advisory lock). Any concurrent writer
-- of that subscription row (webhook, cancel, other admin call) must wait, so the
-- state that was checked is exactly the state that gets updated.
--
-- NOT applied automatically. Apply with the Supabase SQL editor / migration tool.
-- No iyzico/PayTR call is made by this function; it only rewrites our own row.

drop function if exists public.admin_change_user_plan(text, uuid, uuid, uuid, text, text);

create or replace function public.admin_change_user_plan(
  p_admin_email text,
  p_admin_id uuid,
  p_user_id uuid,
  p_plan_id uuid,
  p_reason text,
  p_idem text,
  p_ack_no_payment_sync boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan billing_plans%rowtype;
  v_old_plan billing_plans%rowtype;
  v_sub billing_subscriptions%rowtype;
  v_provider_backed boolean := false;
  v_reason text := p_reason;
  v_old jsonb; v_new jsonb;
begin
  if exists (select 1 from admin_package_audit where idempotency_key = p_idem and status = 'success') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('admin_pkg:' || p_user_id::text));

  if not exists (select 1 from profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  select * into v_plan from billing_plans where id = p_plan_id and active and product_category <> 'addon';
  if not found then return jsonb_build_object('ok', false, 'error', 'plan_not_found'); end if;

  -- Row lock: the provider check below and the UPDATE see the same locked row.
  select * into v_sub from billing_subscriptions
    where user_id = p_user_id and status in ('trialing','active','past_due','incomplete')
    order by created_at desc limit 1 for update;

  if found then
    if v_sub.status = 'incomplete' or v_sub.pending_plan_id is not null then
      return jsonb_build_object('ok', false, 'error', 'payment_in_flight');
    end if;
    if v_sub.plan_id = p_plan_id then return jsonb_build_object('ok', false, 'error', 'same_plan'); end if;

    v_provider_backed := v_sub.provider <> 'mock' and v_sub.provider_ref is not null;

    if v_provider_backed and not coalesce(p_ack_no_payment_sync, false) then
      -- Blocked attempts are audited inside the same call (the table is append-only).
      insert into admin_package_audit
        (admin_email, admin_user_id, target_user_id, action, field, new_value, reason, status, error)
      values
        (p_admin_email, p_admin_id, p_user_id, 'plan_change', 'plan', to_jsonb(p_plan_id), p_reason,
         'blocked', 'payment_sync_required');
      return jsonb_build_object('ok', false, 'error', 'payment_sync_required', 'audited', true);
    end if;

    if v_provider_backed then
      v_reason := coalesce(nullif(btrim(p_reason), '') || ' ', '')
        || '[Ödeme sağlayıcısında değişiklik YAPILMADI - admin onayladı]';
    end if;

    select * into v_old_plan from billing_plans where id = v_sub.plan_id;
    v_old := jsonb_build_object('plan_code', v_old_plan.code, 'plan_name', v_old_plan.name,
      'provider', v_sub.provider, 'status', v_sub.status);
    update billing_subscriptions set
      plan_id = p_plan_id,
      status = case when v_plan.price_cents = 0 then 'active' else status end,
      cancel_at_period_end = case when v_plan.price_cents = 0 then false else cancel_at_period_end end,
      updated_at = now()
    where id = v_sub.id;
    v_new := jsonb_build_object('plan_code', v_plan.code, 'plan_name', v_plan.name,
      'provider', v_sub.provider, 'status', case when v_plan.price_cents = 0 then 'active' else v_sub.status end,
      'period_end', v_sub.current_period_end);
  else
    v_old := jsonb_build_object('plan_code', null, 'plan_name', null);
    insert into billing_subscriptions (user_id, plan_id, status, provider, current_period_start, current_period_end)
    values (p_user_id, p_plan_id, 'active', 'mock', now(),
      case when v_plan.price_cents = 0 then null
           when v_plan.interval = 'year' then now() + interval '12 months'
           else now() + interval '1 month' end);
    v_new := jsonb_build_object('plan_code', v_plan.code, 'plan_name', v_plan.name, 'provider', 'mock', 'status', 'active');
  end if;

  insert into admin_package_audit (admin_email, admin_user_id, target_user_id, action, field, old_value, new_value, reason, idempotency_key)
  values (p_admin_email, p_admin_id, p_user_id, 'plan_change', 'plan', v_old, v_new, v_reason, p_idem);
  return jsonb_build_object('ok', true, 'plan_code', v_plan.code, 'plan_name', v_plan.name,
    'provider_backed', v_provider_backed);
end $$;

-- Only the server (service_role key, used by requireAdmin-guarded actions) may call it.
revoke all on function public.admin_change_user_plan(text, uuid, uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_change_user_plan(text, uuid, uuid, uuid, text, text, boolean)
  to service_role;

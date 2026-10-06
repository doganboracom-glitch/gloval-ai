-- Admin user package management.
-- Adds: append-only audit table, per-user publish-limit override, and four
-- SECURITY DEFINER functions (service-role only) that apply a change and write
-- its audit row in ONE transaction. Existing billing/credit tables are reused.

create table if not exists public.admin_package_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_email text not null,
  admin_user_id uuid,
  target_user_id uuid not null,
  action text not null check (action in ('plan_change','credit_adjust','limit_override','period_change')),
  field text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  status text not null default 'success' check (status in ('success','failed','blocked')),
  error text,
  idempotency_key text
);
create unique index if not exists admin_package_audit_idem_key
  on public.admin_package_audit (idempotency_key) where idempotency_key is not null and status = 'success';
create index if not exists admin_package_audit_target_idx
  on public.admin_package_audit (target_user_id, created_at desc);
alter table public.admin_package_audit enable row level security;

create or replace function public.admin_package_audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'admin_package_audit is append-only';
end $$;
drop trigger if exists admin_package_audit_no_update on public.admin_package_audit;
create trigger admin_package_audit_no_update before update or delete on public.admin_package_audit
  for each row execute function public.admin_package_audit_immutable();

create table if not exists public.user_limit_overrides (
  user_id uuid primary key,
  site_limit integer check (site_limit between 0 and 100),
  expires_at timestamptz,
  reason text,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
alter table public.user_limit_overrides enable row level security;

create or replace function public.admin_change_user_plan(
  p_admin_email text, p_admin_id uuid, p_user_id uuid, p_plan_id uuid, p_reason text, p_idem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_plan billing_plans%rowtype;
  v_old_plan billing_plans%rowtype;
  v_sub billing_subscriptions%rowtype;
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

  select * into v_sub from billing_subscriptions
    where user_id = p_user_id and status in ('trialing','active','past_due','incomplete')
    order by created_at desc limit 1 for update;

  if found then
    if v_sub.status = 'incomplete' or v_sub.pending_plan_id is not null then
      return jsonb_build_object('ok', false, 'error', 'payment_in_flight');
    end if;
    if v_sub.plan_id = p_plan_id then return jsonb_build_object('ok', false, 'error', 'same_plan'); end if;
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
  values (p_admin_email, p_admin_id, p_user_id, 'plan_change', 'plan', v_old, v_new, p_reason, p_idem);
  return jsonb_build_object('ok', true, 'plan_code', v_plan.code, 'plan_name', v_plan.name);
end $$;

create or replace function public.admin_adjust_credits(
  p_admin_email text, p_admin_id uuid, p_user_id uuid, p_amount integer, p_reason text, p_idem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if p_amount = 0 or abs(p_amount) > 1000000 then return jsonb_build_object('ok', false, 'error', 'invalid_amount'); end if;
  if coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;
  if exists (select 1 from admin_package_audit where idempotency_key = p_idem and status = 'success') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  -- Same lock key consume_ai_credits family uses is not known; serialise admin writes per user.
  perform pg_advisory_xact_lock(hashtext('admin_pkg:' || p_user_id::text));
  if not exists (select 1 from profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;
  select coalesce(sum(amount), 0) into v_balance from ai_credit_transactions where user_id = p_user_id;
  if v_balance + p_amount < 0 then
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', v_balance);
  end if;
  insert into ai_credit_transactions (user_id, kind, amount, reason, admin_email)
  values (p_user_id, case when p_amount > 0 then 'gift' else 'adjustment' end, p_amount, p_reason, p_admin_email);
  insert into admin_package_audit (admin_email, admin_user_id, target_user_id, action, field, old_value, new_value, reason, idempotency_key)
  values (p_admin_email, p_admin_id, p_user_id, 'credit_adjust', 'ai_credits',
    to_jsonb(v_balance), to_jsonb(v_balance + p_amount), p_reason, p_idem);
  return jsonb_build_object('ok', true, 'balance', v_balance + p_amount);
end $$;

create or replace function public.admin_set_period_end(
  p_admin_email text, p_admin_id uuid, p_user_id uuid, p_period_end timestamptz, p_reason text, p_idem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sub billing_subscriptions%rowtype; v_price integer;
begin
  if exists (select 1 from admin_package_audit where idempotency_key = p_idem and status = 'success') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  perform pg_advisory_xact_lock(hashtext('admin_pkg:' || p_user_id::text));
  select * into v_sub from billing_subscriptions
    where user_id = p_user_id and status in ('trialing','active','past_due') order by created_at desc limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_active_subscription'); end if;
  if v_sub.pending_plan_id is not null then return jsonb_build_object('ok', false, 'error', 'payment_in_flight'); end if;
  if p_period_end is not null and p_period_end <= v_sub.current_period_start then
    return jsonb_build_object('ok', false, 'error', 'invalid_period_end');
  end if;
  select price_cents into v_price from billing_plans where id = v_sub.plan_id;
  update billing_subscriptions set current_period_end = p_period_end, updated_at = now() where id = v_sub.id;
  insert into admin_package_audit (admin_email, admin_user_id, target_user_id, action, field, old_value, new_value, reason, idempotency_key)
  values (p_admin_email, p_admin_id, p_user_id, 'period_change', 'current_period_end',
    to_jsonb(v_sub.current_period_end), to_jsonb(p_period_end), p_reason, p_idem);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_limit_override(
  p_admin_email text, p_admin_id uuid, p_user_id uuid, p_site_limit integer, p_expires timestamptz, p_reason text, p_idem text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old public.user_limit_overrides%rowtype;
begin
  if exists (select 1 from admin_package_audit where idempotency_key = p_idem and status = 'success') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if p_site_limit is not null and (p_site_limit < 0 or p_site_limit > 100) then
    return jsonb_build_object('ok', false, 'error', 'invalid_limit');
  end if;
  if p_expires is not null and p_expires <= now() then
    return jsonb_build_object('ok', false, 'error', 'invalid_expiry');
  end if;
  perform pg_advisory_xact_lock(hashtext('admin_pkg:' || p_user_id::text));
  if not exists (select 1 from profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;
  select * into v_old from user_limit_overrides where user_id = p_user_id;
  if p_site_limit is null then
    delete from user_limit_overrides where user_id = p_user_id;
  else
    insert into user_limit_overrides (user_id, site_limit, expires_at, reason, updated_by, updated_at)
    values (p_user_id, p_site_limit, p_expires, p_reason, p_admin_email, now())
    on conflict (user_id) do update set site_limit = excluded.site_limit, expires_at = excluded.expires_at,
      reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into admin_package_audit (admin_email, admin_user_id, target_user_id, action, field, old_value, new_value, reason, idempotency_key)
  values (p_admin_email, p_admin_id, p_user_id, 'limit_override', 'site_limit',
    jsonb_build_object('site_limit', v_old.site_limit, 'expires_at', v_old.expires_at),
    jsonb_build_object('site_limit', p_site_limit, 'expires_at', case when p_site_limit is null then null else p_expires end),
    p_reason, p_idem);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_change_user_plan(text, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_adjust_credits(text, uuid, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_period_end(text, uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_limit_override(text, uuid, uuid, integer, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.admin_change_user_plan(text, uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.admin_adjust_credits(text, uuid, uuid, integer, text, text) to service_role;
grant execute on function public.admin_set_period_end(text, uuid, uuid, timestamptz, text, text) to service_role;
grant execute on function public.admin_set_limit_override(text, uuid, uuid, integer, timestamptz, text, text) to service_role;

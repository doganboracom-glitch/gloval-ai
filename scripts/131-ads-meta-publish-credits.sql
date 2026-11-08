-- UNAPPLIED DRAFT. Review and apply only through the approved migration workflow.
-- GLOVAL Ads / Meta: 15-credit publish charge, same rule as Google Ads (scripts/106).
--
-- Rule: 15 AI credits are held when a publish attempt starts (reservation), and are charged ONLY when the
-- Meta plan is fully published (campaign, ad set, image, creative and ad all exist; plan status 'published').
-- Any failure (preflight, partial, auth, quota ...) releases the hold and charges nothing. Activate / pause /
-- budget updates and the AI draft (ads:scan_and_preview) are untouched.
--
-- Run order: after 130. Rollback: 131-ads-meta-publish-credits.rollback.sql.
-- No begin/commit on purpose (apply step by step through the migration workflow).

-- (a) Reservation table -----------------------------------------------------
-- One row per publish attempt (request_id). ledger_reason is 'ads:publish:<request_id>' and unique, so one
-- attempt can never be charged twice (ads_charge_credits is idempotent on it). "At most one charge per plan"
-- is enforced by the partial unique index on (plan_id) where status = 'charged'.
create table if not exists public.ads_meta_publish_credit_reservations (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.ads_meta_plans(id) on delete cascade,
  amount integer not null check (amount = 15),
  status text not null check (status in ('reserved', 'charged', 'released')),
  ledger_reason text not null unique check (ledger_reason ~ '^ads:publish:[A-Za-z0-9_-]{8,128}$'),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists ads_meta_publish_credit_reservations_user_active_idx
  on public.ads_meta_publish_credit_reservations (user_id, created_at)
  where status = 'reserved';
create index if not exists ads_meta_publish_credit_reservations_plan_idx
  on public.ads_meta_publish_credit_reservations (plan_id, created_at desc);
-- Only one open hold per plan at a time.
create unique index if not exists ads_meta_publish_credit_reservations_plan_open_uniq
  on public.ads_meta_publish_credit_reservations (plan_id) where status = 'reserved';
-- At most one charge per plan, ever.
create unique index if not exists ads_meta_publish_credit_reservations_plan_charged_uniq
  on public.ads_meta_publish_credit_reservations (plan_id) where status = 'charged';

alter table public.ads_meta_publish_credit_reservations enable row level security;
alter table public.ads_meta_publish_credit_reservations force row level security;
revoke all on table public.ads_meta_publish_credit_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.ads_meta_publish_credit_reservations to service_role;

-- (b) ads_charge_credits: open holds of Google AND Meta both reduce spendable credits -------------
-- Same body as scripts/106 (SECURITY DEFINER, empty search_path, per-user advisory lock, idempotent on the
-- ledger reason); the only change is that the reserved sum also counts Meta reservations.
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
  select (
    coalesce((
      select sum(r.amount) from public.ads_google_publish_credit_reservations r
       where r.user_id = p_user_id and r.status = 'reserved'
         and (v_exclude_request is null or r.request_id::text <> v_exclude_request)
    ), 0)
    + coalesce((
      select sum(m.amount) from public.ads_meta_publish_credit_reservations m
       where m.user_id = p_user_id and m.status = 'reserved'
         and (v_exclude_request is null or m.request_id::text <> v_exclude_request)
    ), 0)
  )::integer into v_reserved;
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

-- (c) Read-only helper for the approval summary: balance, open holds, spendable ------------------
create or replace function public.ads_meta_publish_credit_balance(p_user_id uuid)
returns table (balance integer, reserved integer, available integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
  v_reserved integer;
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  select coalesce(sum(t.amount), 0)::integer into v_balance
    from public.ai_credit_transactions t where t.user_id = p_user_id;
  select (
    coalesce((select sum(r.amount) from public.ads_google_publish_credit_reservations r
               where r.user_id = p_user_id and r.status = 'reserved'), 0)
    + coalesce((select sum(m.amount) from public.ads_meta_publish_credit_reservations m
               where m.user_id = p_user_id and m.status = 'reserved'), 0)
  )::integer into v_reserved;
  return query select v_balance, v_reserved, greatest(v_balance - v_reserved, 0);
end
$$;

revoke all on function public.ads_meta_publish_credit_balance(uuid) from public, anon, authenticated;
grant execute on function public.ads_meta_publish_credit_balance(uuid) to service_role;

-- (d) Reserve: credit hold + publish capacity in ONE transaction ---------------------------------
-- Order matters: plan readiness, then credits (insufficient credits creates NO Meta object and does not
-- consume the daily attempt quota), then the existing capacity function. States:
--   reserved | insufficient_credits | plan_not_ready | publish_in_progress | already_published |
--   idempotency_conflict | request_reused | invalid_request | user_publish_limit_reached |
--   global_publish_limit_reached
create or replace function public.ads_reserve_meta_publish_credits(
  p_user_id uuid,
  p_plan_id uuid,
  p_connection_id uuid,
  p_request_id uuid,
  p_daily_attempts_per_user integer,
  p_daily_attempts_global integer
)
returns table (state text, action_id uuid, balance integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_meta_plans%rowtype;
  v_existing public.ads_meta_publish_credit_reservations%rowtype;
  v_balance integer;
  v_reserved integer;
  v_available integer;
  v_cap_state text;
  v_action_id uuid;
begin
  if p_user_id is null or p_plan_id is null or p_connection_id is null or p_request_id is null then
    return query select 'invalid_request'::text, null::uuid, 0; return;
  end if;

  -- Same lock as ads_charge_credits and the Google reservation: Google and Meta holds serialize per user.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));

  select coalesce(sum(t.amount), 0)::integer into v_balance
    from public.ai_credit_transactions t where t.user_id = p_user_id;
  select (
    coalesce((select sum(r.amount) from public.ads_google_publish_credit_reservations r
               where r.user_id = p_user_id and r.status = 'reserved'), 0)
    + coalesce((select sum(m.amount) from public.ads_meta_publish_credit_reservations m
               where m.user_id = p_user_id and m.status = 'reserved'), 0)
  )::integer into v_reserved;
  v_available := greatest(v_balance - v_reserved, 0);

  select r.* into v_existing from public.ads_meta_publish_credit_reservations r
   where r.request_id = p_request_id for update;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.plan_id <> p_plan_id then
      return query select 'idempotency_conflict'::text, null::uuid, v_available; return;
    end if;
    -- Double click / replay of the same request: never start a second concurrent publish or a second hold.
    if v_existing.status = 'reserved' then
      return query select 'publish_in_progress'::text, null::uuid, v_available; return;
    end if;
    if v_existing.status = 'charged' then
      return query select 'already_published'::text, null::uuid, v_available; return;
    end if;
    return query select 'request_reused'::text, null::uuid, v_available; return;
  end if;

  select p.* into v_plan from public.ads_meta_plans p
   where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found or v_plan.connection_id is distinct from p_connection_id then
    return query select 'plan_not_ready'::text, null::uuid, v_available; return;
  end if;
  if v_plan.status = 'publishing' or exists (
    select 1 from public.ads_meta_publish_credit_reservations r
     where r.plan_id = p_plan_id and r.status = 'reserved'
  ) then
    return query select 'publish_in_progress'::text, null::uuid, v_available; return;
  end if;
  if v_plan.meta_ad_id is not null or exists (
    select 1 from public.ads_meta_publish_credit_reservations r
     where r.plan_id = p_plan_id and r.status = 'charged'
  ) then
    return query select 'already_published'::text, null::uuid, v_available; return;
  end if;
  if v_plan.status not in ('approved', 'partial', 'failed')
    or v_plan.approved_version is distinct from v_plan.version then
    return query select 'plan_not_ready'::text, null::uuid, v_available; return;
  end if;

  if v_available < 15 then
    insert into public.ads_meta_actions (user_id, plan_id, connection_id, actor, action_type, target, status)
    values (p_user_id, p_plan_id, p_connection_id, 'system', 'meta_publish_denied',
            pg_catalog.jsonb_build_object('reason', 'insufficient_credits', 'required', 15, 'available', v_available),
            'failed');
    return query select 'insufficient_credits'::text, null::uuid, v_available; return;
  end if;

  select c.state, c.action_id into v_cap_state, v_action_id
    from public.ads_reserve_meta_publish_capacity(
      p_user_id, p_plan_id, p_connection_id, p_request_id,
      p_daily_attempts_per_user, p_daily_attempts_global
    ) c;
  if v_cap_state is distinct from 'reserved' or v_action_id is null then
    return query select coalesce(v_cap_state, 'invalid_request'), null::uuid, v_available; return;
  end if;

  insert into public.ads_meta_publish_credit_reservations (request_id, user_id, plan_id, amount, status, ledger_reason)
  values (p_request_id, p_user_id, p_plan_id, 15, 'reserved', 'ads:publish:' || p_request_id::text);

  insert into public.ads_meta_actions (
    user_id, plan_id, connection_id, actor, action_type, idempotency_key, target, status, applied_at
  ) values (
    p_user_id, p_plan_id, p_connection_id, 'system', 'meta_publish_credit_reserved', p_request_id,
    pg_catalog.jsonb_build_object('amount', 15, 'ledger_reason', 'ads:publish:' || p_request_id::text,
                                  'available_before', v_available),
    'applied', pg_catalog.now()
  ) on conflict (user_id, action_type, idempotency_key) where idempotency_key is not null do nothing;

  return query select 'reserved'::text, v_action_id, v_available - 15;
end
$$;

revoke all on function public.ads_reserve_meta_publish_credits(uuid, uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ads_reserve_meta_publish_credits(uuid, uuid, uuid, uuid, integer, integer)
  to service_role;

-- (e) Settle: charge a held reservation for a fully published plan (idempotent, retryable) --------
-- States: charged | already_charged | no_pending_credit | plan_not_published | insufficient_credits | not_found
-- A failed charge keeps the plan published and the hold in place; it is audited and can be retried.
create or replace function public.ads_settle_meta_publish_credit(
  p_user_id uuid,
  p_plan_id uuid
)
returns table (state text, balance integer, charged_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.ads_meta_plans%rowtype;
  v_reservation public.ads_meta_publish_credit_reservations%rowtype;
  v_charge record;
  v_balance integer;
begin
  if p_user_id is null or p_plan_id is null then
    return query select 'not_found'::text, 0, 0; return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));

  select p.* into v_plan from public.ads_meta_plans p
   where p.id = p_plan_id and p.user_id = p_user_id for update;
  if not found then return query select 'not_found'::text, 0, 0; return; end if;

  select coalesce(sum(t.amount), 0)::integer into v_balance
    from public.ai_credit_transactions t where t.user_id = p_user_id;

  if exists (
    select 1 from public.ads_meta_publish_credit_reservations r
     where r.plan_id = p_plan_id and r.status = 'charged'
  ) then
    -- Any other open hold for an already-charged plan is redundant.
    update public.ads_meta_publish_credit_reservations r
       set status = 'released', finished_at = pg_catalog.now()
     where r.plan_id = p_plan_id and r.status = 'reserved';
    return query select 'already_charged'::text, v_balance, 0; return;
  end if;

  if v_plan.status not in ('published', 'active', 'user_paused')
    or v_plan.meta_campaign_id is null or v_plan.meta_adset_id is null or v_plan.meta_image_hash is null
    or v_plan.meta_creative_id is null or v_plan.meta_ad_id is null then
    return query select 'plan_not_published'::text, v_balance, 0; return;
  end if;

  select r.* into v_reservation from public.ads_meta_publish_credit_reservations r
   where r.plan_id = p_plan_id and r.user_id = p_user_id and r.status = 'reserved' for update;
  if not found then return query select 'no_pending_credit'::text, v_balance, 0; return; end if;

  select * into v_charge from public.ads_charge_credits(p_user_id, v_reservation.amount, v_reservation.ledger_reason);
  if not coalesce(v_charge.ok, false) then
    insert into public.ads_meta_actions (user_id, plan_id, connection_id, actor, action_type, target, status)
    values (p_user_id, p_plan_id, v_plan.connection_id, 'system', 'meta_publish_credit_charge_failed',
            pg_catalog.jsonb_build_object('amount', v_reservation.amount, 'request_id', v_reservation.request_id,
                                          'reason', 'insufficient_credits'),
            'failed');
    return query select 'insufficient_credits'::text, coalesce(v_charge.balance, 0), 0; return;
  end if;

  update public.ads_meta_publish_credit_reservations r
     set status = 'charged', finished_at = pg_catalog.now()
   where r.request_id = v_reservation.request_id;

  insert into public.ads_meta_actions (
    user_id, plan_id, connection_id, actor, action_type, idempotency_key, target, status, applied_at
  ) values (
    p_user_id, p_plan_id, v_plan.connection_id, 'system', 'meta_publish_credit_charged', v_reservation.request_id,
    pg_catalog.jsonb_build_object('amount', v_reservation.amount, 'ledger_reason', v_reservation.ledger_reason,
                                  'already_charged', coalesce(v_charge.already_charged, false)),
    'applied', pg_catalog.now()
  ) on conflict (user_id, action_type, idempotency_key) where idempotency_key is not null do nothing;

  return query select
    case when coalesce(v_charge.already_charged, false) then 'already_charged' else 'charged' end::text,
    v_charge.balance, v_charge.charged_amount;
end
$$;

revoke all on function public.ads_settle_meta_publish_credit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ads_settle_meta_publish_credit(uuid, uuid) to service_role;

-- (f) Finish: existing atomic finish + credit settle / release ------------------------------------
-- Wraps ads_finish_meta_publish (kept unchanged). 'published' -> try the charge; a failing charge NEVER
-- rolls the publish back (credit_state 'charge_pending', retry through ads_settle_meta_publish_credit).
-- 'partial' / 'failed' -> the hold is released and nothing is charged.
-- credit_state: charged | already_charged | charge_pending | released | no_reservation | none
create or replace function public.ads_finish_meta_publish_v2(
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
returns table (state text, credit_state text, balance integer, charged_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_request_id uuid;
  v_reservation public.ads_meta_publish_credit_reservations%rowtype;
  v_plan public.ads_meta_plans%rowtype;
  v_settle record;
  v_balance integer;
  v_release_reason text;
begin
  select f.state into v_state from public.ads_finish_meta_publish(
    p_user_id, p_plan_id, p_action_id, p_outcome, p_campaign_id, p_adset_id, p_image_hash,
    p_creative_id, p_ad_id, p_failure_step, p_failure_code, p_failure_reason
  ) f;
  if v_state is null or v_state not in ('published', 'partial', 'failed') then
    return query select coalesce(v_state, 'invalid_request'), 'none'::text, 0, 0; return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));
  select coalesce(sum(t.amount), 0)::integer into v_balance
    from public.ai_credit_transactions t where t.user_id = p_user_id;

  select a.idempotency_key into v_request_id from public.ads_meta_actions a
   where a.id = p_action_id and a.user_id = p_user_id and a.plan_id = p_plan_id;
  select r.* into v_reservation from public.ads_meta_publish_credit_reservations r
   where r.request_id = v_request_id and r.user_id = p_user_id and r.plan_id = p_plan_id and r.status = 'reserved'
   for update;
  if not found then
    return query select v_state, 'no_reservation'::text, v_balance, 0; return;
  end if;

  select p.* into v_plan from public.ads_meta_plans p where p.id = p_plan_id and p.user_id = p_user_id;

  if v_state = 'published'
    and v_plan.meta_campaign_id is not null and v_plan.meta_adset_id is not null
    and v_plan.meta_image_hash is not null and v_plan.meta_creative_id is not null
    and v_plan.meta_ad_id is not null then
    begin
      select * into v_settle from public.ads_settle_meta_publish_credit(p_user_id, p_plan_id);
    exception when others then
      v_settle := null;
    end;
    if v_settle is not null and v_settle.state in ('charged', 'already_charged') then
      return query select v_state, v_settle.state, v_settle.balance, v_settle.charged_amount; return;
    end if;
    -- Charge failed or errored: the publish stays, the hold stays, the user is told, a retry is possible.
    if v_settle is null then
      insert into public.ads_meta_actions (user_id, plan_id, connection_id, actor, action_type, target, status)
      values (p_user_id, p_plan_id, v_plan.connection_id, 'system', 'meta_publish_credit_charge_failed',
              pg_catalog.jsonb_build_object('amount', v_reservation.amount, 'request_id', v_reservation.request_id,
                                            'reason', 'charge_error'),
              'failed');
    end if;
    return query select v_state, 'charge_pending'::text, v_balance, 0; return;
  end if;

  v_release_reason := case when v_state = 'published' then 'incomplete_objects' else v_state end;
  update public.ads_meta_publish_credit_reservations r
     set status = 'released', finished_at = pg_catalog.now()
   where r.request_id = v_reservation.request_id;
  insert into public.ads_meta_actions (
    user_id, plan_id, connection_id, actor, action_type, idempotency_key, target, status, applied_at
  ) values (
    p_user_id, p_plan_id, v_plan.connection_id, 'system', 'meta_publish_credit_released', v_reservation.request_id,
    pg_catalog.jsonb_build_object('amount', v_reservation.amount, 'reason', v_release_reason,
                                  'failure_step', p_failure_step, 'failure_code', p_failure_code),
    'applied', pg_catalog.now()
  ) on conflict (user_id, action_type, idempotency_key) where idempotency_key is not null do nothing;
  return query select v_state, 'released'::text, v_balance, 0;
end
$$;

revoke all on function public.ads_finish_meta_publish_v2(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.ads_finish_meta_publish_v2(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text)
  to service_role;

-- NOT APPLIED: referral partner administration controls and audit history.
-- Apply manually only after confirming the target environment and reviewing this migration.

create table if not exists public.referral_partner_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('suspend', 'reactivate', 'close')),
  from_status text not null check (from_status in ('active', 'suspended', 'closed')),
  to_status text not null check (to_status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists referral_partner_events_partner_created_idx
  on public.referral_partner_events (partner_id, created_at desc);

alter table public.referral_partner_events enable row level security;
revoke all on table public.referral_partner_events from public, anon, authenticated;
grant select, insert on table public.referral_partner_events to service_role;

drop policy if exists referral_partner_events_service_role_select on public.referral_partner_events;
create policy referral_partner_events_service_role_select
  on public.referral_partner_events
  for select to service_role
  using (true);

drop policy if exists referral_partner_events_service_role_insert on public.referral_partner_events;
create policy referral_partner_events_service_role_insert
  on public.referral_partner_events
  for insert to service_role
  with check (true);

create or replace function public.referral_partner_admin_summary(p_query text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with click_totals as (
    select
      clicks.partner_id,
      sum(clicks.unique_clicks)::bigint as clicks
    from public.referral_daily_clicks as clicks
    group by clicks.partner_id
  ),
  attribution_totals as (
    select
      attribution.partner_id,
      count(*)::bigint as signups,
      count(*) filter (where attribution.verified_at is not null)::bigint as verified_signups,
      (
        count(distinct attribution.referred_user_id) filter (
          where attribution.referred_user_id is not null
            and exists (
              select 1
              from public.billing_transactions as transaction_row
              where transaction_row.user_id = attribution.referred_user_id
                and transaction_row.subscription_id is not null
                and transaction_row.kind = 'charge'
                and transaction_row.amount_cents > 0
                and transaction_row.status = 'succeeded'
            )
        )
      )::bigint as paid_customers
    from public.referral_attributions as attribution
    group by attribution.partner_id
  ),
  status_changes as (
    select
      events.partner_id,
      max(events.created_at) as last_status_changed_at
    from public.referral_partner_events as events
    group by events.partner_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'partnerId', partner.id,
        'referralCode', partner.referral_code,
        'status', partner.status,
        'activatedAt', coalesce(partner.terms_accepted_at, partner.created_at),
        'lastStatusChangedAt', coalesce(status_changes.last_status_changed_at, partner.created_at),
        'ibanLast4', partner.iban_last4,
        'email', owner.email,
        'clicks', coalesce(click_totals.clicks, 0)::bigint,
        'signups', coalesce(attribution_totals.signups, 0)::bigint,
        'verifiedSignups', coalesce(attribution_totals.verified_signups, 0)::bigint,
        'paidCustomers', coalesce(attribution_totals.paid_customers, 0)::bigint
      )
      order by partner.created_at desc, partner.id desc
    ),
    '[]'::jsonb
  )
  from public.referral_partners as partner
  left join auth.users as owner on owner.id = partner.user_id
  left join click_totals on click_totals.partner_id = partner.id
  left join attribution_totals on attribution_totals.partner_id = partner.id
  left join status_changes on status_changes.partner_id = partner.id
  where p_query is null
    or btrim(p_query) = ''
    or strpos(lower(coalesce(owner.email, '')), lower(btrim(p_query))) > 0
    or strpos(lower(partner.referral_code), lower(btrim(p_query))) > 0;
$$;

revoke all on function public.referral_partner_admin_summary(text) from public, anon, authenticated;
grant execute on function public.referral_partner_admin_summary(text) to service_role;

create or replace function public.transition_referral_partner_status(
  p_partner_id uuid,
  p_actor_user_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner public.referral_partners%rowtype;
  v_to_status text;
  v_changed_at timestamptz := now();
  v_event_id uuid;
begin
  if p_actor_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_actor');
  end if;

  if p_action is null or p_action not in ('suspend', 'reactivate', 'close') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;

  select partner.*
    into v_partner
    from public.referral_partners as partner
    where partner.id = p_partner_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_action = 'suspend' and v_partner.status = 'active' then
    v_to_status := 'suspended';
  elsif p_action = 'reactivate' and v_partner.status in ('suspended', 'closed') then
    v_to_status := 'active';
  elsif p_action = 'close' and v_partner.status in ('active', 'suspended') then
    v_to_status := 'closed';
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_transition');
  end if;

  update public.referral_partners as partner
    set status = v_to_status,
        payee_name = case when v_to_status = 'closed' then null else partner.payee_name end,
        tax_status = case when v_to_status = 'closed' then null else partner.tax_status end,
        iban_ciphertext = case when v_to_status = 'closed' then null else partner.iban_ciphertext end,
        iban_key_version = case when v_to_status = 'closed' then null else partner.iban_key_version end,
        iban_last4 = case when v_to_status = 'closed' then null else partner.iban_last4 end
    where partner.id = p_partner_id;

  insert into public.referral_partner_events (
    partner_id,
    actor_user_id,
    action,
    from_status,
    to_status,
    created_at
  ) values (
    p_partner_id,
    p_actor_user_id,
    p_action,
    v_partner.status,
    v_to_status,
    v_changed_at
  ) returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'eventId', v_event_id,
    'fromStatus', v_partner.status,
    'toStatus', v_to_status,
    'changedAt', v_changed_at
  );
end;
$$;

revoke all on function public.transition_referral_partner_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_referral_partner_status(uuid, uuid, text) to service_role;

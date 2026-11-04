-- NOT APPLIED: referral dashboard deletion-safe status and paid-customer counts.
-- Apply manually after scripts/099-referral-commission-ledger.sql and 100-referral-payout-workflows.sql.
-- This draft does not execute against any database.

begin;

create or replace function public.referral_partner_dashboard(
  p_user_id uuid default null,
  p_include_customers boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_include_customers and p_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'customer rows require a partner user id';
  end if;

  with partner_rows as materialized (
    select
      partner.id,
      partner.user_id,
      partner.referral_code,
      partner.status,
      partner.created_at,
      partner.iban_last4
    from public.referral_partners as partner
    where p_user_id is null or partner.user_id = p_user_id
  ),
  click_totals as (
    select clicks.partner_id, sum(clicks.unique_clicks)::bigint as clicks
    from public.referral_daily_clicks as clicks
    join partner_rows as partner on partner.id = clicks.partner_id
    group by clicks.partner_id
  ),
  attribution_rows as materialized (
    select
      attribution.partner_id,
      attribution.id,
      attribution.referred_user_id,
      attribution.verified_at,
      attribution.created_at,
      referred_user.email as referred_email,
      (
        p_user_id is not null
        and (
          exists (
            select 1
            from public.referral_commissions as commission
            where commission.attribution_id = attribution.id
              and commission.status <> 'reversed'
          )
          or (
            attribution.referred_user_id is not null
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
        )
      ) as is_paid
    from public.referral_attributions as attribution
    join partner_rows as partner on partner.id = attribution.partner_id
    left join auth.users as referred_user on referred_user.id = attribution.referred_user_id
  ),
  attribution_totals as (
    select
      attribution.partner_id,
      count(*)::bigint as signups,
      count(*) filter (where attribution.verified_at is not null)::bigint as verified_signups,
      count(*) filter (where attribution.is_paid)::bigint as paid_customers
    from attribution_rows as attribution
    group by attribution.partner_id
  ),
  ranked_customers as (
    select
      attribution.*,
      row_number() over (
        partition by attribution.partner_id
        order by attribution.created_at desc, attribution.id desc
      ) as customer_rank
    from attribution_rows as attribution
    where p_include_customers
  ),
  customer_lists as (
    select
      customer.partner_id,
      jsonb_agg(
        jsonb_build_object(
          'email', case when customer.referred_user_id is null then null else customer.referred_email end,
          'accountDeleted', customer.referred_user_id is null,
          'status', case
            when customer.is_paid then 'paid'
            when customer.verified_at is not null then 'verified'
            else 'signup'
          end,
          'createdAt', customer.created_at
        )
        order by customer.created_at desc, customer.id desc
      ) as customers
    from ranked_customers as customer
    where customer.customer_rank <= 20
    group by customer.partner_id
  ),
  summaries as (
    select
      partner.id,
      partner.referral_code,
      partner.status,
      partner.created_at,
      partner.iban_last4,
      case when p_user_id is null then owner.email else null end as owner_email,
      coalesce(clicks.clicks, 0)::bigint as clicks,
      coalesce(attributions.signups, 0)::bigint as signups,
      coalesce(attributions.verified_signups, 0)::bigint as verified_signups,
      coalesce(attributions.paid_customers, 0)::bigint as paid_customers,
      coalesce(customers.customers, '[]'::jsonb) as customers
    from partner_rows as partner
    left join auth.users as owner on owner.id = partner.user_id
    left join click_totals as clicks on clicks.partner_id = partner.id
    left join attribution_totals as attributions on attributions.partner_id = partner.id
    left join customer_lists as customers on customers.partner_id = partner.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'referralCode', summary.referral_code,
        'status', summary.status,
        'activatedAt', summary.created_at,
        'ibanLast4', summary.iban_last4,
        'email', summary.owner_email,
        'clicks', summary.clicks,
        'signups', summary.signups,
        'verifiedSignups', summary.verified_signups,
        'paidCustomers', case when p_user_id is null then null else summary.paid_customers end,
        'customers', case when p_include_customers then summary.customers else '[]'::jsonb end
      ) order by summary.created_at desc, summary.id desc
    ),
    '[]'::jsonb
  ) into v_result
  from summaries as summary;

  return v_result;
end;
$$;

revoke all on function public.referral_partner_dashboard(uuid, boolean) from public, anon, authenticated;
grant execute on function public.referral_partner_dashboard(uuid, boolean) to service_role;

create or replace function public.referral_partner_admin_summary(p_query text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with click_totals as (
    select clicks.partner_id, sum(clicks.unique_clicks)::bigint as clicks
    from public.referral_daily_clicks as clicks
    group by clicks.partner_id
  ),
  attribution_totals as (
    select
      attribution.partner_id,
      count(*)::bigint as signups,
      count(*) filter (where attribution.verified_at is not null)::bigint as verified_signups,
      count(*) filter (
        where exists (
          select 1
          from public.referral_commissions as commission
          where commission.attribution_id = attribution.id
            and commission.status <> 'reversed'
        )
        or (
          attribution.referred_user_id is not null
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
    select events.partner_id, max(events.created_at) as last_status_changed_at
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
      ) order by partner.created_at desc, partner.id desc
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

commit;

-- NOT APPLIED by this change. Apply after 095-referral-core.sql and 096-maker-requests.sql.
-- The RPC returns only partner aggregates and, for an authenticated owner
-- request, the 20 most recent referred customers. Email values are consumed
-- and masked by server code before any result reaches a client.

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
      p.id,
      p.user_id,
      p.referral_code,
      p.status,
      p.created_at,
      p.iban_last4
    from public.referral_partners p
    where p_user_id is null or p.user_id = p_user_id
  ),
  click_totals as (
    select c.partner_id, sum(c.unique_clicks)::bigint as clicks
    from public.referral_daily_clicks c
    join partner_rows p on p.id = c.partner_id
    group by c.partner_id
  ),
  attribution_rows as materialized (
    select
      a.partner_id,
      a.id,
      a.referred_user_id,
      a.verified_at,
      a.created_at,
      referred_user.email as referred_email,
      (
        p_user_id is not null
        and a.referred_user_id is not null
        and exists (
          select 1
          from public.billing_transactions transaction_row
          where transaction_row.user_id = a.referred_user_id
            and transaction_row.subscription_id is not null
            and transaction_row.kind = 'charge'
            and transaction_row.amount_cents > 0
            and transaction_row.status = 'succeeded'
        )
      ) as is_paid
    from public.referral_attributions a
    join partner_rows p on p.id = a.partner_id
    left join auth.users referred_user on referred_user.id = a.referred_user_id
  ),
  attribution_totals as (
    select
      a.partner_id,
      count(*)::bigint as signups,
      count(*) filter (where a.verified_at is not null)::bigint as verified_signups,
      count(*) filter (where a.is_paid)::bigint as paid_customers
    from attribution_rows a
    group by a.partner_id
  ),
  ranked_customers as (
    select
      a.*,
      row_number() over (
        partition by a.partner_id
        order by a.created_at desc, a.id desc
      ) as customer_rank
    from attribution_rows a
    where p_include_customers
  ),
  customer_lists as (
    select
      c.partner_id,
      jsonb_agg(
        jsonb_build_object(
          'email', c.referred_email,
          'status', case
            when c.is_paid then 'paid'
            when c.verified_at is not null then 'verified'
            else 'signup'
          end,
          'createdAt', c.created_at
        )
        order by c.created_at desc, c.id desc
      ) as customers
    from ranked_customers c
    where c.customer_rank <= 20
    group by c.partner_id
  ),
  summaries as (
    select
      p.id,
      p.referral_code,
      p.status,
      p.created_at,
      p.iban_last4,
      case when p_user_id is null then owner.email else null end as owner_email,
      coalesce(clicks.clicks, 0)::bigint as clicks,
      coalesce(attributions.signups, 0)::bigint as signups,
      coalesce(attributions.verified_signups, 0)::bigint as verified_signups,
      coalesce(attributions.paid_customers, 0)::bigint as paid_customers,
      coalesce(customers.customers, '[]'::jsonb) as customers
    from partner_rows p
    left join auth.users owner on owner.id = p.user_id
    left join click_totals clicks on clicks.partner_id = p.id
    left join attribution_totals attributions on attributions.partner_id = p.id
    left join customer_lists customers on customers.partner_id = p.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'referralCode', s.referral_code,
        'status', s.status,
        'activatedAt', s.created_at,
        'ibanLast4', s.iban_last4,
        'email', s.owner_email,
        'clicks', s.clicks,
        'signups', s.signups,
        'verifiedSignups', s.verified_signups,
        'paidCustomers', case when p_user_id is null then null else s.paid_customers end,
        'customers', case when p_include_customers then s.customers else '[]'::jsonb end
      )
      order by s.created_at desc, s.id desc
    ),
    '[]'::jsonb
  )
  into v_result
  from summaries s;

  return v_result;
end;
$$;

revoke all on function public.referral_partner_dashboard(uuid, boolean) from public, anon, authenticated;
grant execute on function public.referral_partner_dashboard(uuid, boolean) to service_role;

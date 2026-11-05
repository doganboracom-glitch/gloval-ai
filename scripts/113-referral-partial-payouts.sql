-- NOT APPLIED: partial referral payouts and company VAT snapshots.
-- Apply manually after scripts/108-referral-credit-conversion.sql.
-- This draft does not execute against any database.

alter table public.referral_payout_requests
  add column if not exists vat_mode text,
  add column if not exists invoice_net_cents bigint,
  add column if not exists invoice_vat_cents bigint,
  add column if not exists invoice_gross_cents bigint;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.referral_payout_requests'::regclass
      and conname = 'referral_payout_requests_vat_mode_check'
  ) then
    alter table public.referral_payout_requests
      add constraint referral_payout_requests_vat_mode_check
      check (vat_mode is null or vat_mode in ('included', 'added'));
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.referral_payout_requests'::regclass
      and conname = 'referral_payout_requests_vat_cash_company_check'
  ) then
    alter table public.referral_payout_requests
      add constraint referral_payout_requests_vat_cash_company_check
      check (
        vat_mode is null
        or (method = 'cash' and tax_status_snapshot = 'company' and invoice_required is true)
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.referral_payout_requests'::regclass
      and conname = 'referral_payout_requests_invoice_cents_nonnegative_check'
  ) then
    alter table public.referral_payout_requests
      add constraint referral_payout_requests_invoice_cents_nonnegative_check
      check (
        (invoice_net_cents is null or invoice_net_cents >= 0)
        and (invoice_vat_cents is null or invoice_vat_cents >= 0)
        and (invoice_gross_cents is null or invoice_gross_cents >= 0)
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.referral_payout_requests'::regclass
      and conname = 'referral_payout_requests_invoice_breakdown_check'
  ) then
    alter table public.referral_payout_requests
      add constraint referral_payout_requests_invoice_breakdown_check
      check (
        (
          invoice_net_cents is null
          and invoice_vat_cents is null
          and invoice_gross_cents is null
        )
        or (
          invoice_net_cents is not null
          and invoice_vat_cents is not null
          and invoice_gross_cents is not null
          and invoice_net_cents + invoice_vat_cents = invoice_gross_cents
        )
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.referral_payout_requests'::regclass
      and conname = 'referral_payout_requests_vat_invoice_required_check'
  ) then
    alter table public.referral_payout_requests
      add constraint referral_payout_requests_vat_invoice_required_check
      check (vat_mode is null or invoice_required is true);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.referral_payout_requests'::regclass
      and conname = 'referral_payout_requests_vat_breakdown_present_check'
  ) then
    alter table public.referral_payout_requests
      add constraint referral_payout_requests_vat_breakdown_present_check
      check (
        vat_mode is null
        or (
          invoice_net_cents is not null
          and invoice_vat_cents is not null
          and invoice_gross_cents is not null
        )
      );
  end if;
end;
$$;

create or replace function public.referral_partner_payout_balance(p_partner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending bigint := 0;
  v_available bigint := 0;
  v_convertible bigint := 0;
  v_requested bigint := 0;
  v_converted bigint := 0;
  v_paid bigint := 0;
  v_open_cash boolean := false;
  v_has_debt_bucket boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if not exists (
    select 1 from public.referral_partners where id = p_partner_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select
    coalesce(sum(ledger.amount_cents) filter (where ledger.available_at > v_now), 0),
    coalesce(sum(ledger.amount_cents) filter (where ledger.available_at <= v_now), 0),
    coalesce(sum(ledger.amount_cents), 0)
  into v_pending, v_available, v_convertible
  from public.referral_commission_ledger as ledger
  where ledger.partner_id = p_partner_id;

  select coalesce(bool_or(bucket.amount_cents < 0), false)
  into v_has_debt_bucket
  from (
    select ledger.available_at, sum(ledger.amount_cents)::bigint as amount_cents
    from public.referral_commission_ledger as ledger
    where ledger.partner_id = p_partner_id
      and ledger.available_at > v_now
    group by ledger.available_at
  ) as bucket;

  select
    coalesce(sum(request.balance_cents) filter (where request.status = 'requested'), 0),
    coalesce(sum(request.balance_cents) filter (where request.method = 'credit' and request.status = 'processed'), 0),
    coalesce(sum(request.balance_cents) filter (where request.method = 'cash' and request.status = 'processed'), 0),
    coalesce(bool_or(request.method = 'cash' and request.status = 'requested'), false)
  into v_requested, v_converted, v_paid, v_open_cash
  from public.referral_payout_requests as request
  where request.partner_id = p_partner_id;

  return jsonb_build_object(
    'ok', true,
    'pendingCents', v_pending,
    'availableCents', greatest(0, v_available),
    'totalCents', v_pending + v_available,
    'convertibleCents', v_convertible,
    'requestedCents', v_requested,
    'convertedCents', v_converted,
    'paidCents', v_paid,
    'hasOpenCashRequest', v_open_cash,
    'hasDebtBucket', v_has_debt_bucket,
    'maxCreditCents', v_convertible,
    'maxCashCents', greatest(0, v_available)
  );
end;
$$;

revoke all on function public.referral_partner_payout_balance(uuid) from public, anon, authenticated;
grant execute on function public.referral_partner_payout_balance(uuid) to service_role;

drop function if exists public.request_referral_payout(uuid, uuid, text, uuid, bigint, text);
drop function if exists public.request_referral_payout(uuid, uuid, text, uuid);

create function public.request_referral_payout(
  p_partner_id uuid,
  p_user_id uuid,
  p_method text,
  p_idempotency_key uuid,
  p_amount_cents bigint default null,
  p_vat_mode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner public.referral_partners%rowtype;
  v_existing public.referral_payout_requests%rowtype;
  v_request_id uuid;
  v_now timestamptz := clock_timestamp();
  v_available bigint := 0;
  v_convertible bigint := 0;
  v_max_cents bigint := 0;
  v_payout_balance bigint := 0;
  v_payout_cents bigint := 0;
  v_credit_amount integer;
  v_credit_amount_numeric numeric;
  v_topup_cents bigint := 0;
  v_invoice_required boolean := false;
  v_invoice_net_cents bigint;
  v_invoice_vat_cents bigint;
  v_invoice_gross_cents bigint;
  v_partial boolean := false;
  v_has_debt_bucket boolean := false;
  v_existing_partial boolean := false;
  v_remaining bigint := 0;
  v_take bigint := 0;
  v_bucket record;
  v_language text;
begin
  if p_partner_id is null
    or p_user_id is null
    or p_idempotency_key is null
    or p_method not in ('cash', 'credit')
    or (p_amount_cents is not null and p_amount_cents <= 0) then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  if p_vat_mode is not null and p_vat_mode not in ('included', 'added') then
    return jsonb_build_object('ok', false, 'error', 'vat_mode_not_allowed');
  end if;

  select partner.*
  into v_partner
  from public.referral_partners as partner
  where partner.id = p_partner_id
  for update;

  if not found or v_partner.user_id is distinct from p_user_id then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  select request.*
  into v_existing
  from public.referral_payout_requests as request
  where request.partner_id = p_partner_id
    and request.idempotency_key = p_idempotency_key
  for update;

  if found then
    select coalesce(bool_or(audit.details ->> 'partial' = 'true'), false)
    into v_existing_partial
    from public.referral_payout_audit_events as audit
    where audit.payout_request_id = v_existing.id
      and audit.event_type in ('credit_payout_converted', 'cash_payout_requested');

    if v_existing.method <> p_method
      or v_existing.vat_mode is distinct from p_vat_mode
      or (p_amount_cents is null and v_existing_partial)
      or (p_amount_cents is not null and v_existing.balance_cents <> p_amount_cents) then
      return jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
    end if;

    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'requestId', v_existing.id,
      'method', v_existing.method,
      'status', v_existing.status,
      'balanceCents', v_existing.balance_cents,
      'payoutCents', v_existing.payout_cents,
      'creditAmount', v_existing.credit_amount,
      'systemTopupCents', v_existing.system_topup_cents,
      'invoiceRequired', v_existing.invoice_required,
      'partial', v_existing_partial,
      'vatMode', v_existing.vat_mode,
      'invoiceNetCents', v_existing.invoice_net_cents,
      'invoiceVatCents', v_existing.invoice_vat_cents,
      'invoiceGrossCents', v_existing.invoice_gross_cents,
      'partnerId', p_partner_id,
      'partnerLanguage', v_partner.preferred_language,
      'taxSuspended', false
    );
  end if;

  if v_partner.status = 'closed' then
    return jsonb_build_object('ok', false, 'error', 'partner_closed');
  end if;

  if p_method = 'cash'
    and v_partner.status = 'suspended'
    and v_partner.tax_verified_at is null
    and exists (
      select 1
      from public.referral_payout_requests as prior_cash_payout
      where prior_cash_payout.partner_id = p_partner_id
        and prior_cash_payout.method = 'cash'
        and prior_cash_payout.status = 'processed'
    ) then
    return jsonb_build_object('ok', false, 'error', 'tax_verification_required');
  end if;

  if p_method = 'cash' and exists (
    select 1
    from public.referral_payout_requests as request
    where request.partner_id = p_partner_id
      and request.method = 'cash'
      and request.status = 'requested'
  ) then
    return jsonb_build_object('ok', false, 'error', 'open_cash_request');
  end if;

  update public.referral_commissions
  set status = 'available'
  where partner_id = p_partner_id
    and status = 'pending'
    and available_at <= v_now;

  select
    coalesce(sum(ledger.amount_cents) filter (where ledger.available_at <= v_now), 0),
    coalesce(sum(ledger.amount_cents), 0)
  into v_available, v_convertible
  from public.referral_commission_ledger as ledger
  where ledger.partner_id = p_partner_id;

  if p_method = 'cash' then
    v_max_cents := greatest(0, v_available);
    if v_max_cents < 100000 then
      return jsonb_build_object('ok', false, 'error', 'minimum_not_met', 'availableCents', v_max_cents, 'maxCashCents', v_max_cents);
    end if;
    if p_vat_mode is not null and v_partner.tax_status <> 'company' then
      return jsonb_build_object('ok', false, 'error', 'vat_mode_not_allowed');
    end if;
    if v_partner.tax_status = 'company' and p_vat_mode is null then
      return jsonb_build_object('ok', false, 'error', 'vat_mode_required');
    end if;
    if v_partner.tax_status not in ('individual', 'company')
      or v_partner.payee_name is null
      or v_partner.iban_ciphertext is null
      or v_partner.iban_key_version is null
      or v_partner.iban_last4 is null then
      return jsonb_build_object('ok', false, 'error', 'payout_details_missing');
    end if;

    if p_amount_cents is not null and p_amount_cents > v_max_cents then
      return jsonb_build_object('ok', false, 'error', 'amount_exceeds_balance', 'maxCashCents', v_max_cents);
    end if;

    v_payout_balance := coalesce(p_amount_cents, v_max_cents);
    if v_payout_balance < 100000 then
      return jsonb_build_object('ok', false, 'error', 'minimum_not_met', 'availableCents', v_max_cents, 'maxCashCents', v_max_cents);
    end if;
    v_partial := v_payout_balance < v_max_cents;
    v_invoice_required := v_partner.tax_status = 'company';

    if v_invoice_required then
      if p_vat_mode = 'included' then
        v_invoice_gross_cents := v_payout_balance;
        v_invoice_net_cents := round(v_invoice_gross_cents::numeric * 100 / 120)::bigint;
        v_invoice_vat_cents := v_invoice_gross_cents - v_invoice_net_cents;
        v_payout_cents := v_invoice_gross_cents;
      else
        v_invoice_net_cents := v_payout_balance;
        v_invoice_vat_cents := round(v_invoice_net_cents::numeric * 20 / 100)::bigint;
        v_invoice_gross_cents := v_invoice_net_cents + v_invoice_vat_cents;
        v_payout_cents := v_invoice_gross_cents;
      end if;
    else
      v_payout_cents := v_payout_balance;
    end if;
  else
    if p_vat_mode is not null then
      return jsonb_build_object('ok', false, 'error', 'vat_mode_not_allowed');
    end if;

    v_max_cents := v_convertible;
    if v_max_cents < 300 then
      return jsonb_build_object('ok', false, 'error', 'credit_minimum_not_met', 'availableCents', greatest(0, v_available), 'convertibleCents', v_convertible, 'maxCreditCents', v_max_cents);
    end if;
    if p_amount_cents is not null and p_amount_cents > v_max_cents then
      return jsonb_build_object('ok', false, 'error', 'amount_exceeds_balance', 'maxCreditCents', v_max_cents);
    end if;

    v_payout_balance := coalesce(p_amount_cents, v_max_cents);
    if v_payout_balance < 300 then
      return jsonb_build_object('ok', false, 'error', 'credit_minimum_not_met', 'availableCents', greatest(0, v_available), 'convertibleCents', v_convertible, 'maxCreditCents', v_max_cents);
    end if;

    select coalesce(bool_or(bucket.amount_cents < 0), false)
    into v_has_debt_bucket
    from (
      select ledger.available_at, sum(ledger.amount_cents)::bigint as amount_cents
      from public.referral_commission_ledger as ledger
      where ledger.partner_id = p_partner_id
        and ledger.available_at > v_now
      group by ledger.available_at
    ) as bucket;

    v_partial := v_payout_balance < v_max_cents;
    if v_partial and v_has_debt_bucket then
      return jsonb_build_object('ok', false, 'error', 'partial_unavailable_debt', 'availableCents', greatest(0, v_available), 'convertibleCents', v_convertible, 'maxCreditCents', v_max_cents);
    end if;

    v_credit_amount_numeric := ceil(v_payout_balance::numeric / 300);
    if v_credit_amount_numeric < 1 or v_credit_amount_numeric > 2147483647 then
      return jsonb_build_object('ok', false, 'error', 'credit_amount_out_of_range');
    end if;
    v_credit_amount := v_credit_amount_numeric::integer;
    v_topup_cents := v_credit_amount::bigint * 300 - v_payout_balance;
    if v_topup_cents > 299 then
      return jsonb_build_object('ok', false, 'error', 'credit_topup_out_of_range');
    end if;
    v_payout_cents := v_payout_balance;
  end if;

  insert into public.referral_payout_requests (
    partner_id,
    method,
    balance_cents,
    payout_cents,
    credit_amount,
    system_topup_cents,
    invoice_required,
    invoice_confirmed,
    tax_status_snapshot,
    payee_name_snapshot,
    iban_last4_snapshot,
    status,
    idempotency_key,
    requested_at,
    processed_at,
    vat_mode,
    invoice_net_cents,
    invoice_vat_cents,
    invoice_gross_cents
  ) values (
    p_partner_id,
    p_method,
    v_payout_balance,
    v_payout_cents,
    v_credit_amount,
    v_topup_cents,
    v_invoice_required,
    false,
    v_partner.tax_status,
    case when p_method = 'cash' then v_partner.payee_name else null end,
    case when p_method = 'cash' then v_partner.iban_last4 else null end,
    case when p_method = 'credit' then 'processed' else 'requested' end,
    p_idempotency_key,
    v_now,
    case when p_method = 'credit' then v_now else null end,
    p_vat_mode,
    v_invoice_net_cents,
    v_invoice_vat_cents,
    v_invoice_gross_cents
  ) returning id into v_request_id;

  if p_method = 'credit' then
    if v_partial then
      v_remaining := v_payout_balance;
      if v_available > 0 then
        v_take := least(v_available, v_remaining);
        if v_take > 0 then
          insert into public.referral_commission_ledger (
            partner_id, payout_request_id, entry_type, amount_cents, available_at, dedupe_key
          ) values (
            p_partner_id,
            v_request_id,
            'payout_request',
            -v_take,
            v_now,
            'payout-request:' || v_request_id::text || ':available'
          );
          v_remaining := v_remaining - v_take;
        end if;
      end if;

      for v_bucket in
        select ledger.available_at, sum(ledger.amount_cents)::bigint as amount_cents
        from public.referral_commission_ledger as ledger
        where ledger.partner_id = p_partner_id
          and ledger.available_at > v_now
        group by ledger.available_at
        having sum(ledger.amount_cents) > 0
        order by ledger.available_at asc
      loop
        exit when v_remaining = 0;
        v_take := least(v_bucket.amount_cents, v_remaining);
        insert into public.referral_commission_ledger (
          partner_id, payout_request_id, entry_type, amount_cents, available_at, dedupe_key
        ) values (
          p_partner_id,
          v_request_id,
          'payout_request',
          -v_take,
          v_bucket.available_at,
          'payout-request:' || v_request_id::text || ':future:' ||
            to_char(v_bucket.available_at at time zone 'UTC', 'YYYYMMDD"T"HH24MISS.US"Z"')
        );
        v_remaining := v_remaining - v_take;
      end loop;

      if v_remaining <> 0 then
        raise exception 'referral_credit_partial_allocation_incomplete';
      end if;
    else
      insert into public.referral_commission_ledger (
        partner_id, payout_request_id, entry_type, amount_cents, available_at, dedupe_key
      )
      select
        p_partner_id,
        v_request_id,
        'payout_request',
        -available_bucket.amount_cents,
        v_now,
        'payout-request:' || v_request_id::text || ':available'
      from (
        select coalesce(sum(ledger.amount_cents), 0)::bigint as amount_cents
        from public.referral_commission_ledger as ledger
        where ledger.partner_id = p_partner_id
          and ledger.available_at <= v_now
      ) as available_bucket
      where available_bucket.amount_cents <> 0;

      insert into public.referral_commission_ledger (
        partner_id, payout_request_id, entry_type, amount_cents, available_at, dedupe_key
      )
      select
        p_partner_id,
        v_request_id,
        'payout_request',
        -maturity_bucket.amount_cents,
        maturity_bucket.available_at,
        'payout-request:' || v_request_id::text || ':future:' ||
          to_char(maturity_bucket.available_at at time zone 'UTC', 'YYYYMMDD"T"HH24MISS.US"Z"')
      from (
        select ledger.available_at, sum(ledger.amount_cents)::bigint as amount_cents
        from public.referral_commission_ledger as ledger
        where ledger.partner_id = p_partner_id
          and ledger.available_at > v_now
        group by ledger.available_at
      ) as maturity_bucket
      where maturity_bucket.amount_cents <> 0;
    end if;
  else
    insert into public.referral_commission_ledger (
      partner_id, payout_request_id, entry_type, amount_cents, available_at, dedupe_key
    ) values (
      p_partner_id,
      v_request_id,
      'payout_request',
      -v_payout_balance,
      v_now,
      'payout-request:' || v_request_id::text
    );
  end if;

  if not v_partial then
    update public.referral_commissions
    set status = case when p_method = 'credit' then 'converted' else 'requested' end,
        payout_request_id = v_request_id
    where partner_id = p_partner_id
      and (
        (p_method = 'credit' and status in ('pending', 'available'))
        or (p_method = 'cash' and status = 'available')
      );
  end if;

  if p_method = 'credit' then
    perform pg_advisory_xact_lock(hashtext(v_partner.user_id::text));
    insert into public.ai_credit_transactions (user_id, kind, amount, reason)
    values (
      v_partner.user_id,
      'gift',
      v_credit_amount,
      'referral_payout:' || v_request_id::text
    );

    insert into public.referral_payout_audit_events (
      partner_id, payout_request_id, actor_user_id, event_type, details
    ) values (
      p_partner_id,
      v_request_id,
      p_user_id,
      'credit_payout_converted',
      jsonb_build_object(
        'balanceCents', v_payout_balance,
        'payoutCents', v_payout_cents,
        'creditAmount', v_credit_amount,
        'systemTopupCents', v_topup_cents,
        'partial', v_partial,
        'vatMode', p_vat_mode,
        'taxSuspended', false
      )
    );
  else
    insert into public.referral_payout_audit_events (
      partner_id, payout_request_id, actor_user_id, event_type, details
    ) values (
      p_partner_id,
      v_request_id,
      p_user_id,
      'cash_payout_requested',
      jsonb_build_object(
        'balanceCents', v_payout_balance,
        'payoutCents', v_payout_cents,
        'invoiceRequired', v_invoice_required,
        'partial', v_partial,
        'vatMode', p_vat_mode,
        'invoiceNetCents', v_invoice_net_cents,
        'invoiceVatCents', v_invoice_vat_cents,
        'invoiceGrossCents', v_invoice_gross_cents
      )
    );
  end if;

  v_language := case when v_partner.preferred_language = 'en' then 'en' else 'tr' end;
  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'requestId', v_request_id,
    'method', p_method,
    'status', case when p_method = 'credit' then 'processed' else 'requested' end,
    'balanceCents', v_payout_balance,
    'payoutCents', v_payout_cents,
    'creditAmount', v_credit_amount,
    'systemTopupCents', v_topup_cents,
    'invoiceRequired', v_invoice_required,
    'partial', v_partial,
    'vatMode', p_vat_mode,
    'invoiceNetCents', v_invoice_net_cents,
    'invoiceVatCents', v_invoice_vat_cents,
    'invoiceGrossCents', v_invoice_gross_cents,
    'partnerId', p_partner_id,
    'partnerLanguage', v_language,
    'taxSuspended', false
  );
end;
$$;

revoke all on function public.request_referral_payout(uuid, uuid, text, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.request_referral_payout(uuid, uuid, text, uuid, bigint, text) to service_role;

create or replace function public.referral_payout_admin_list(
  p_status text default null,
  p_query text default null,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'requestId', payout.id,
      'partnerId', partner.id,
      'referralCode', partner.referral_code,
      'partnerStatus', partner.status,
      'email', owner.email,
      'payeeName', payout.payee_name_snapshot,
      'taxStatus', payout.tax_status_snapshot,
      'taxVerifiedAt', partner.tax_verified_at,
      'ibanLast4', payout.iban_last4_snapshot,
      'method', payout.method,
      'balanceCents', payout.balance_cents,
      'payoutCents', payout.payout_cents,
      'creditAmount', payout.credit_amount,
      'systemTopupCents', payout.system_topup_cents,
      'invoiceRequired', payout.invoice_required,
      'invoiceConfirmed', payout.invoice_confirmed,
      'invoiceReference', payout.invoice_reference,
      'invoiceReceivedAt', payout.invoice_received_at,
      'invoiceNetCents', payout.invoice_net_cents,
      'invoiceVatCents', payout.invoice_vat_cents,
      'invoiceGrossCents', payout.invoice_gross_cents,
      'vatMode', payout.vat_mode,
      'partial', coalesce((
        select bool_or(audit.details ->> 'partial' = 'true')
        from public.referral_payout_audit_events as audit
        where audit.payout_request_id = payout.id
          and audit.event_type in ('credit_payout_converted', 'cash_payout_requested')
      ), false),
      'paymentReference', payout.payment_reference,
      'adminNote', payout.admin_note,
      'status', payout.status,
      'requestedAt', payout.requested_at,
      'processedAt', payout.processed_at,
      'rejectionReason', payout.rejection_reason
    ) order by payout.requested_at desc
  ),
  '[]'::jsonb
)
from (
  select request.*
  from public.referral_payout_requests as request
  where p_status is null
    or p_status = 'all'
    or request.status = p_status
  order by request.requested_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200))
) as payout
join public.referral_partners as partner on partner.id = payout.partner_id
left join auth.users as owner on owner.id = partner.user_id
where p_query is null
  or btrim(p_query) = ''
  or strpos(lower(coalesce(owner.email, '')), lower(btrim(p_query))) > 0
  or strpos(lower(partner.referral_code), lower(btrim(p_query))) > 0
  or strpos(lower(coalesce(payout.payee_name_snapshot, '')), lower(btrim(p_query))) > 0;
$$;

revoke all on function public.referral_payout_admin_list(text, text, integer) from public, anon, authenticated;
grant execute on function public.referral_payout_admin_list(text, text, integer) to service_role;

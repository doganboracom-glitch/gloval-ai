-- NOT APPLIED: referral balance and payout RPC replacements for immediate credit conversion.
-- Apply manually after scripts/103-referral-payout-workflows.sql.
-- This draft does not execute against any database.

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
    'availableCents', v_available,
    'totalCents', v_pending + v_available,
    'convertibleCents', v_convertible,
    'requestedCents', v_requested,
    'convertedCents', v_converted,
    'paidCents', v_paid,
    'hasOpenCashRequest', v_open_cash
  );
end;
$$;

revoke all on function public.referral_partner_payout_balance(uuid) from public, anon, authenticated;
grant execute on function public.referral_partner_payout_balance(uuid) to service_role;

create or replace function public.request_referral_payout(
  p_partner_id uuid,
  p_user_id uuid,
  p_method text,
  p_idempotency_key uuid
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
  v_pending bigint := 0;
  v_available bigint := 0;
  v_convertible bigint := 0;
  v_payout_balance bigint := 0;
  v_payout_cents bigint := 0;
  v_credit_amount integer;
  v_credit_amount_numeric numeric;
  v_topup_cents bigint := 0;
  v_invoice_required boolean := false;
  v_language text;
begin
  if p_user_id is null or p_idempotency_key is null or p_method not in ('cash', 'credit') then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
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
    if v_existing.method <> p_method then
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
    if v_available < 100000 then
      return jsonb_build_object('ok', false, 'error', 'minimum_not_met', 'availableCents', v_available);
    end if;
    v_payout_balance := v_available;
  else
    v_payout_balance := v_convertible;
    if v_payout_balance < 300 then
      return jsonb_build_object('ok', false, 'error', 'credit_minimum_not_met', 'availableCents', v_payout_balance);
    end if;
  end if;

  if p_method = 'cash' then
    if v_partner.tax_status not in ('individual', 'company')
      or v_partner.payee_name is null
      or v_partner.iban_ciphertext is null
      or v_partner.iban_key_version is null
      or v_partner.iban_last4 is null then
      return jsonb_build_object('ok', false, 'error', 'payout_details_missing');
    end if;
    v_invoice_required := v_partner.tax_status = 'company';
    v_payout_cents := case
      when v_invoice_required then round(v_payout_balance::numeric * 1.20)::bigint
      else v_payout_balance
    end;
  else
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
    processed_at
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
    case when p_method = 'credit' then v_now else null end
  ) returning id into v_request_id;

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

  update public.referral_commissions
    set status = case when p_method = 'credit' then 'converted' else 'requested' end,
        payout_request_id = v_request_id
    where partner_id = p_partner_id
      and (
        (p_method = 'credit' and status in ('pending', 'available'))
        or (p_method = 'cash' and status = 'available')
      );

  if p_method = 'credit' then
    -- Keep serialization with the credit ledger consumed by consume_ai_credits.
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
        'creditAmount', v_credit_amount,
        'systemTopupCents', v_topup_cents,
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
        'invoiceRequired', v_invoice_required
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
    'partnerId', p_partner_id,
    'partnerLanguage', v_language,
    'taxSuspended', false
  );
end;
$$;

revoke all on function public.request_referral_payout(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.request_referral_payout(uuid, uuid, text, uuid) to service_role;

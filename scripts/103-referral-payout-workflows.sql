-- NOT APPLIED: atomic partner payout RPCs, admin audit actions, and close guards.
-- Apply manually after scripts/102-referral-commission-ledger.sql.
-- This draft does not execute against any database.
-- Thresholds, VAT, credit value, hold, and top-up limit mirror lib/referrals/commission-config.ts.

begin;

create or replace function public.referral_partner_payout_balance(p_partner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending bigint := 0;
  v_available bigint := 0;
  v_requested bigint := 0;
  v_converted bigint := 0;
  v_paid bigint := 0;
  v_open_cash boolean := false;
begin
  if not exists (
    select 1 from public.referral_partners where id = p_partner_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select
    coalesce(sum(ledger.amount_cents) filter (where ledger.available_at > clock_timestamp()), 0),
    coalesce(sum(ledger.amount_cents) filter (where ledger.available_at <= clock_timestamp()), 0)
  into v_pending, v_available
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
  v_available bigint := 0;
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

  select coalesce(sum(ledger.amount_cents), 0)
    into v_available
    from public.referral_commission_ledger as ledger
    where ledger.partner_id = p_partner_id
      and ledger.available_at <= v_now;

  if v_available < 100000 then
    return jsonb_build_object('ok', false, 'error', 'minimum_not_met', 'availableCents', v_available);
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
      when v_invoice_required then round(v_available::numeric * 1.20)::bigint
      else v_available
    end;
  else
    v_credit_amount_numeric := ceil(v_available::numeric / 300);
    if v_credit_amount_numeric < 1 or v_credit_amount_numeric > 2147483647 then
      return jsonb_build_object('ok', false, 'error', 'credit_amount_out_of_range');
    end if;
    v_credit_amount := v_credit_amount_numeric::integer;
    v_topup_cents := v_credit_amount::bigint * 300 - v_available;
    if v_topup_cents > 299 then
      return jsonb_build_object('ok', false, 'error', 'credit_topup_out_of_range');
    end if;
    v_payout_cents := v_available;
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
    v_available,
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
    -v_available,
    v_now,
    'payout-request:' || v_request_id::text
  );

  update public.referral_commissions
    set status = case when p_method = 'credit' then 'converted' else 'requested' end,
        payout_request_id = v_request_id
    where partner_id = p_partner_id
      and status = 'available';

  if p_method = 'credit' then
    -- Reuse the existing append-only credit ledger consumed by consume_ai_credits.
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
        'balanceCents', v_available,
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
        'balanceCents', v_available,
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
    'balanceCents', v_available,
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

create or replace function public.record_referral_cash_invoice(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_invoice_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.referral_payout_requests%rowtype;
  v_now timestamptz := clock_timestamp();
  v_reference text := btrim(coalesce(p_invoice_reference, ''));
begin
  if p_actor_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_actor');
  end if;
  if char_length(v_reference) not between 2 and 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_invoice_reference');
  end if;

  select request.*
    into v_request
    from public.referral_payout_requests as request
    where request.id = p_request_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_request.method <> 'cash'
    or v_request.status <> 'requested'
    or v_request.invoice_required is not true then
    return jsonb_build_object('ok', false, 'error', 'invalid_transition');
  end if;

  if v_request.invoice_confirmed then
    if v_request.invoice_reference = v_reference then
      return jsonb_build_object('ok', true, 'duplicate', true, 'requestId', v_request.id);
    end if;
    return jsonb_build_object('ok', false, 'error', 'invoice_already_recorded');
  end if;

  update public.referral_payout_requests
    set invoice_confirmed = true,
        invoice_reference = v_reference,
        invoice_received_at = v_now,
        processed_by = p_actor_user_id
    where id = v_request.id;

  insert into public.referral_payout_audit_events (
    partner_id, payout_request_id, actor_user_id, event_type, details
  ) values (
    v_request.partner_id,
    v_request.id,
    p_actor_user_id,
    'cash_invoice_received',
    jsonb_build_object('invoiceReferencePresent', true, 'receivedAt', v_now)
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'requestId', v_request.id,
    'partnerId', v_request.partner_id,
    'invoiceReceivedAt', v_now
  );
end;
$$;

revoke all on function public.record_referral_cash_invoice(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_referral_cash_invoice(uuid, uuid, text) to service_role;

create or replace function public.process_referral_cash_payout(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_payment_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.referral_payout_requests%rowtype;
  v_partner public.referral_partners%rowtype;
  v_now timestamptz := clock_timestamp();
  v_balance_without_request bigint := 0;
  v_tax_suspended boolean := false;
begin
  if p_actor_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_actor');
  end if;

  select request.*
    into v_request
    from public.referral_payout_requests as request
    where request.id = p_request_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select partner.*
    into v_partner
    from public.referral_partners as partner
    where partner.id = v_request.partner_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'partner_not_found');
  end if;

  if v_request.status = 'processed' then
    return jsonb_build_object(
      'ok', true,
      'alreadyProcessed', true,
      'requestId', v_request.id,
      'partnerId', v_partner.id,
      'partnerLanguage', v_partner.preferred_language,
      'taxSuspended', false
    );
  end if;
  if v_request.method <> 'cash' or v_request.status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'transition_conflict');
  end if;
  if v_partner.iban_ciphertext is null or v_partner.iban_key_version is null then
    return jsonb_build_object('ok', false, 'error', 'iban_unavailable');
  end if;
  if p_payment_reference is null or char_length(btrim(p_payment_reference)) not between 2 and 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_payment_reference');
  end if;
  if v_request.invoice_required and (
    v_request.invoice_confirmed is not true
    or v_request.invoice_reference is null
    or v_request.invoice_received_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'invoice_confirmation_required');
  end if;

  select coalesce(sum(ledger.amount_cents), 0) + v_request.balance_cents
    into v_balance_without_request
    from public.referral_commission_ledger as ledger
    where ledger.partner_id = v_request.partner_id
      and ledger.available_at <= v_now;
  if v_balance_without_request < v_request.balance_cents then
    return jsonb_build_object('ok', false, 'error', 'balance_adjusted');
  end if;

  update public.referral_payout_requests
  set status = 'processed',
      invoice_confirmed = v_request.invoice_required and v_request.invoice_confirmed,
        payment_reference = btrim(p_payment_reference),
        processed_at = v_now,
        processed_by = p_actor_user_id
    where id = v_request.id;

  update public.referral_commissions
    set status = 'paid'
    where payout_request_id = v_request.id
      and status = 'requested';

  if v_partner.tax_verified_at is null and v_partner.status = 'active' then
    update public.referral_partners
      set status = 'suspended'
      where id = v_partner.id;
    insert into public.referral_partner_events (
      partner_id, actor_user_id, action, from_status, to_status, created_at
    ) values (
      v_partner.id, p_actor_user_id, 'suspend', 'active', 'suspended', v_now
    );
    v_tax_suspended := true;
  end if;

  insert into public.referral_payout_audit_events (
    partner_id, payout_request_id, actor_user_id, event_type, details
  ) values (
    v_partner.id,
    v_request.id,
    p_actor_user_id,
    'cash_payout_paid',
    jsonb_build_object(
      'balanceCents', v_request.balance_cents,
      'payoutCents', v_request.payout_cents,
      'invoiceRequired', v_request.invoice_required,
      'invoiceConfirmed', v_request.invoice_required and v_request.invoice_confirmed,
      'paymentReferencePresent', true,
      'taxSuspended', v_tax_suspended
    )
  );

  return jsonb_build_object(
    'ok', true,
    'alreadyProcessed', false,
    'requestId', v_request.id,
    'partnerId', v_partner.id,
    'partnerLanguage', v_partner.preferred_language,
    'balanceCents', v_request.balance_cents,
    'payoutCents', v_request.payout_cents,
    'invoiceRequired', v_request.invoice_required,
    'taxSuspended', v_tax_suspended
  );
end;
$$;

revoke all on function public.process_referral_cash_payout(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.process_referral_cash_payout(uuid, uuid, text) to service_role;

create or replace function public.reject_referral_cash_payout(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.referral_payout_requests%rowtype;
  v_partner public.referral_partners%rowtype;
  v_now timestamptz := clock_timestamp();
  v_reason text;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if p_actor_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_actor');
  end if;
  if char_length(v_note) not between 3 and 500 then
    return jsonb_build_object('ok', false, 'error', 'invalid_note');
  end if;
  if p_reason not in ('admin_rejected', 'details_incomplete', 'compliance_review') then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;

  select request.*
    into v_request
    from public.referral_payout_requests as request
    where request.id = p_request_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select partner.*
    into v_partner
    from public.referral_partners as partner
    where partner.id = v_request.partner_id
    for update;

  if v_request.status = 'rejected' then
    return jsonb_build_object(
      'ok', true,
      'alreadyProcessed', true,
      'requestId', v_request.id,
      'partnerId', v_request.partner_id,
      'partnerLanguage', v_partner.preferred_language
    );
  end if;
  if v_request.method <> 'cash' or v_request.status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'transition_conflict');
  end if;

  v_reason := p_reason;
  insert into public.referral_commission_ledger (
    partner_id, payout_request_id, entry_type, amount_cents, available_at, dedupe_key
  ) values (
    v_request.partner_id,
    v_request.id,
    'payout_rejection',
    v_request.balance_cents,
    v_now,
    'payout-rejected:' || v_request.id::text
  ) on conflict (dedupe_key) do nothing;

  update public.referral_payout_requests
    set status = 'rejected',
        processed_at = v_now,
        processed_by = p_actor_user_id,
        rejection_reason = v_reason,
        admin_note = v_note
    where id = v_request.id;

  update public.referral_commissions
    set status = 'available',
        payout_request_id = null
    where payout_request_id = v_request.id
      and status = 'requested';

  insert into public.referral_payout_audit_events (
    partner_id, payout_request_id, actor_user_id, event_type, details
  ) values (
    v_request.partner_id,
    v_request.id,
    p_actor_user_id,
    'cash_payout_rejected',
    jsonb_build_object(
      'balanceCents', v_request.balance_cents,
      'reason', v_reason,
      'adminNotePresent', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'alreadyProcessed', false,
    'requestId', v_request.id,
    'partnerId', v_request.partner_id,
    'partnerLanguage', v_partner.preferred_language,
    'balanceCents', v_request.balance_cents,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.reject_referral_cash_payout(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.reject_referral_cash_payout(uuid, uuid, text, text) to service_role;

create or replace function public.verify_referral_partner_tax(
  p_partner_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner public.referral_partners%rowtype;
  v_now timestamptz := clock_timestamp();
  v_to_status text;
begin
  if p_actor_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_actor');
  end if;

  select partner.*
    into v_partner
    from public.referral_partners as partner
    where partner.id = p_partner_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_partner.status = 'closed' then
    return jsonb_build_object('ok', false, 'error', 'invalid_transition');
  end if;
  if v_partner.payee_name is null or v_partner.tax_status not in ('individual', 'company') then
    return jsonb_build_object('ok', false, 'error', 'tax_data_missing');
  end if;
  if v_partner.tax_verified_at is not null then
    return jsonb_build_object(
      'ok', true,
      'alreadyVerified', true,
      'partnerId', p_partner_id,
      'status', v_partner.status
    );
  end if;

  v_to_status := case when v_partner.status = 'suspended' then 'active' else v_partner.status end;
  update public.referral_partners
    set tax_verified_at = v_now,
        tax_verified_by = p_actor_user_id,
        status = v_to_status
    where id = p_partner_id;

  if v_partner.status = 'suspended' then
    insert into public.referral_partner_events (
      partner_id, actor_user_id, action, from_status, to_status, created_at
    ) values (
      p_partner_id, p_actor_user_id, 'reactivate', 'suspended', 'active', v_now
    );
  end if;

  insert into public.referral_payout_audit_events (
    partner_id, actor_user_id, event_type, details
  ) values (
    p_partner_id,
    p_actor_user_id,
    'tax_information_verified',
    jsonb_build_object('fromStatus', v_partner.status, 'toStatus', v_to_status)
  );

  return jsonb_build_object(
    'ok', true,
    'alreadyVerified', false,
    'partnerId', p_partner_id,
    'status', v_to_status,
    'verifiedAt', v_now
  );
end;
$$;

revoke all on function public.verify_referral_partner_tax(uuid, uuid) from public, anon, authenticated;
grant execute on function public.verify_referral_partner_tax(uuid, uuid) to service_role;

create or replace function public.record_referral_payout_iban_reveal(
  p_partner_id uuid,
  p_request_id uuid,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last4 text;
begin
  if p_actor_user_id is null then
    return false;
  end if;

  select request.iban_last4_snapshot
    into v_last4
    from public.referral_payout_requests as request
    where request.id = p_request_id
      and request.partner_id = p_partner_id
      and request.method = 'cash';
  if not found then
    return false;
  end if;

  insert into public.referral_payout_audit_events (
    partner_id, payout_request_id, actor_user_id, event_type, details
  ) values (
    p_partner_id,
    p_request_id,
    p_actor_user_id,
    'iban_revealed',
    jsonb_build_object('last4', v_last4)
  );
  return true;
end;
$$;

revoke all on function public.record_referral_payout_iban_reveal(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_referral_payout_iban_reveal(uuid, uuid, uuid) to service_role;

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
    select *
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

create or replace function public.referral_payout_admin_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'pendingCents', coalesce((
      select sum(ledger.amount_cents)
      from public.referral_commission_ledger as ledger
      where ledger.available_at > clock_timestamp()
    ), 0),
    'availableCents', coalesce((
      select sum(ledger.amount_cents)
      from public.referral_commission_ledger as ledger
      where ledger.available_at <= clock_timestamp()
    ), 0),
    'convertedCents', coalesce((
      select sum(request.balance_cents)
      from public.referral_payout_requests as request
      where request.method = 'credit' and request.status = 'processed'
    ), 0),
    'systemTopupCents', coalesce((
      select sum(request.system_topup_cents)
      from public.referral_payout_requests as request
      where request.method = 'credit' and request.status = 'processed'
    ), 0),
    'paidCents', coalesce((
      select sum(request.balance_cents)
      from public.referral_payout_requests as request
      where request.method = 'cash' and request.status = 'processed'
    ), 0),
    'openCashRequests', coalesce((
      select count(*)
      from public.referral_payout_requests as request
      where request.method = 'cash' and request.status = 'requested'
    ), 0)
  );
$$;

revoke all on function public.referral_payout_admin_summary() from public, anon, authenticated;
grant execute on function public.referral_payout_admin_summary() to service_role;

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
  v_changed_at timestamptz := clock_timestamp();
  v_event_id uuid;
  v_balance_cents bigint := 0;
  v_open_cash_request boolean := false;
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

  if p_action = 'close' then
    select coalesce(sum(ledger.amount_cents), 0)
      into v_balance_cents
      from public.referral_commission_ledger as ledger
      where ledger.partner_id = p_partner_id;
    select exists (
      select 1
      from public.referral_payout_requests as request
      where request.partner_id = p_partner_id
        and request.method = 'cash'
        and request.status = 'requested'
    ) into v_open_cash_request;

    if v_balance_cents > 0 or v_open_cash_request then
      return jsonb_build_object(
        'ok', false,
        'error', 'balance_outstanding',
        'balanceCents', v_balance_cents,
        'openCashRequest', v_open_cash_request
      );
    end if;
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
        iban_last4 = case when v_to_status = 'closed' then null else partner.iban_last4 end,
        tax_verified_at = case when v_to_status = 'closed' then null else partner.tax_verified_at end,
        tax_verified_by = case when v_to_status = 'closed' then null else partner.tax_verified_by end
    where partner.id = p_partner_id;

  insert into public.referral_partner_events (
    partner_id, actor_user_id, action, from_status, to_status, created_at
  ) values (
    p_partner_id, p_actor_user_id, p_action, v_partner.status, v_to_status, v_changed_at
  ) returning id into v_event_id;

  insert into public.referral_payout_audit_events (
    partner_id, actor_user_id, event_type, details
  ) values (
    p_partner_id,
    p_actor_user_id,
    'partner_' || p_action,
    jsonb_build_object('fromStatus', v_partner.status, 'toStatus', v_to_status)
  );

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

commit;

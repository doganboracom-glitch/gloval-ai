-- UNAPPLIED: prepared for review; do not apply to production from this chat.
-- Prerequisites: scripts/018-domain-renewals.sql, scripts/095-referral-core.sql,
-- and scripts/102-referral-commission-ledger.sql.
--
-- Adds retryable expiry synchronization for completed domain renewals and an
-- idempotent record-only path for full iyzico refunds. This does not call iyzico.

begin;

alter table public.domain_renewals
  add column if not exists expiry_sync_pending boolean not null default false;

create index if not exists domain_renewals_expiry_sync_pending_idx
  on public.domain_renewals (updated_at, id)
  where status = 'completed' and expiry_sync_pending = true;

alter table public.billing_transactions
  add column if not exists refund_status text not null default 'none',
  add column if not exists refunded_amount_cents bigint not null default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_of_transaction_id uuid
    references public.billing_transactions(id) on delete restrict;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_transactions'::regclass
      and conname = 'billing_transactions_refund_status_check'
  ) then
    alter table public.billing_transactions
      add constraint billing_transactions_refund_status_check
      check (refund_status in ('none', 'refunded'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_transactions'::regclass
      and conname = 'billing_transactions_refunded_amount_nonnegative_check'
  ) then
    alter table public.billing_transactions
      add constraint billing_transactions_refunded_amount_nonnegative_check
      check (refunded_amount_cents >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.billing_transactions'::regclass
      and conname = 'billing_transactions_refund_parent_kind_check'
  ) then
    alter table public.billing_transactions
      add constraint billing_transactions_refund_parent_kind_check
      check (refund_of_transaction_id is null or kind = 'refund');
  end if;
end;
$migration$;

create index if not exists billing_transactions_refund_parent_idx
  on public.billing_transactions (refund_of_transaction_id)
  where refund_of_transaction_id is not null;

create unique index if not exists billing_transactions_iyzico_refund_reference_uidx
  on public.billing_transactions (provider_ref)
  where kind = 'refund' and provider = 'iyzico' and provider_ref is not null;

create unique index if not exists billing_transactions_one_full_refund_per_charge_uidx
  on public.billing_transactions (refund_of_transaction_id)
  where kind = 'refund' and status = 'succeeded' and refund_of_transaction_id is not null;

alter table public.custom_domains enable row level security;
alter table public.domain_renewals enable row level security;
alter table public.billing_transactions enable row level security;

grant select, update on public.custom_domains to service_role;
grant select, update on public.domain_renewals to service_role;
grant select, insert, update on public.billing_transactions to service_role;

create or replace function public.referral_sync_commission_reversals(
  p_partner_id uuid default null,
  p_transaction_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_commission record;
  v_reversed_at timestamptz;
  v_pre_hold boolean;
  v_reason text;
  v_count integer := 0;
begin
  for v_commission in
    select
      commission.id,
      commission.partner_id,
      commission.billing_transaction_id,
      commission.commission_cents,
      commission.available_at,
      original.status as original_status,
      exists (
        select 1
        from public.billing_transactions as refund_row
        where refund_row.kind = 'refund'
          and refund_row.status = 'succeeded'
          and (
            refund_row.refund_of_transaction_id = original.id
            or (
              refund_row.refund_of_transaction_id is null
              and refund_row.subscription_id = original.subscription_id
            )
          )
      ) as has_refund
    from public.referral_commissions as commission
    join public.billing_transactions as original
      on original.id = commission.billing_transaction_id
    where commission.status <> 'reversed'
      and (p_partner_id is null or commission.partner_id = p_partner_id)
      and (
        original.status <> 'succeeded'
        or exists (
          select 1
          from public.billing_transactions as refund_row
          where refund_row.kind = 'refund'
            and refund_row.status = 'succeeded'
            and (
              refund_row.refund_of_transaction_id = original.id
              or (
                refund_row.refund_of_transaction_id is null
                and refund_row.subscription_id = original.subscription_id
              )
            )
        )
      )
      and (
        p_transaction_id is null
        or original.id = p_transaction_id
        or exists (
          select 1
          from public.billing_transactions as refund_row
          where refund_row.id = p_transaction_id
            and refund_row.kind = 'refund'
            and refund_row.status = 'succeeded'
            and (
              refund_row.refund_of_transaction_id = original.id
              or (
                refund_row.refund_of_transaction_id is null
                and refund_row.subscription_id = original.subscription_id
              )
            )
        )
      )
    for update of commission
  loop
    v_reversed_at := clock_timestamp();
    v_pre_hold := v_commission.available_at > v_reversed_at;
    v_reason := case
      when v_commission.has_refund then 'refund'
      else 'payment_status_changed'
    end;

    if v_commission.commission_cents > 0 then
      insert into public.referral_commission_ledger (
        partner_id, commission_id, billing_transaction_id, entry_type,
        amount_cents, available_at, dedupe_key
      ) values (
        v_commission.partner_id,
        v_commission.id,
        v_commission.billing_transaction_id,
        case when v_pre_hold then 'refund_pre_hold' else 'refund_adjustment' end,
        -v_commission.commission_cents,
        case when v_pre_hold then v_commission.available_at else v_reversed_at end,
        'commission-reversal:' || v_commission.id::text
      ) on conflict (dedupe_key) do nothing;
    end if;

    update public.referral_commissions
      set status = 'reversed',
          reversed_at = v_reversed_at,
          reversal_kind = case when v_pre_hold then 'pre_hold' else 'post_hold' end,
          reversal_reason = v_reason
      where id = v_commission.id
        and status <> 'reversed';

    insert into public.referral_payout_audit_events (
      partner_id, payout_request_id, actor_user_id, event_type, details
    )
    select
      v_commission.partner_id,
      commission.payout_request_id,
      null,
      'commission_reversed',
      jsonb_build_object(
        'commissionId', v_commission.id,
        'commissionCents', v_commission.commission_cents,
        'reversalKind', case when v_pre_hold then 'pre_hold' else 'post_hold' end,
        'reason', v_reason
      )
    from public.referral_commissions as commission
    where commission.id = v_commission.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.referral_sync_commission_reversals(uuid, uuid) from public, anon, authenticated;
grant execute on function public.referral_sync_commission_reversals(uuid, uuid) to service_role;

create or replace function public.record_iyzico_billing_refund(
  p_charge_id uuid,
  p_provider_ref text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.billing_transactions%rowtype;
  v_existing public.billing_transactions%rowtype;
  v_refund_id uuid;
  v_provider_ref text := btrim(coalesce(p_provider_ref, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
begin
  if p_charge_id is null
    or char_length(v_provider_ref) = 0
    or char_length(v_provider_ref) > 128
    or char_length(v_idempotency_key) = 0
    or char_length(v_idempotency_key) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_refund_reference');
  end if;

  select * into v_charge
  from public.billing_transactions
  where id = p_charge_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_transaction');
  end if;

  if v_charge.user_id is null
    or v_charge.kind <> 'charge'
    or v_charge.status <> 'succeeded'
    or v_charge.provider <> 'iyzico'
    or v_charge.amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'error', 'payment_not_refundable');
  end if;

  select * into v_existing
  from public.billing_transactions
  where kind = 'refund'
    and provider = 'iyzico'
    and provider_ref = v_provider_ref
  limit 1;

  if found then
    if v_existing.refund_of_transaction_id = p_charge_id
      or (v_existing.refund_of_transaction_id is null and v_existing.idempotency_key = v_idempotency_key) then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'refundTransactionId', v_existing.id
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'refund_reference_conflict');
  end if;

  select * into v_existing
  from public.billing_transactions
  where refund_of_transaction_id = p_charge_id
    and kind = 'refund'
    and status = 'succeeded'
  limit 1;

  if found or v_charge.refund_status = 'refunded' or v_charge.refunded_amount_cents > 0 then
    return jsonb_build_object('ok', false, 'error', 'refund_already_recorded');
  end if;

  select * into v_existing
  from public.billing_transactions
  where user_id = v_charge.user_id
    and idempotency_key = v_idempotency_key
  limit 1;

  if found then
    if v_existing.kind = 'refund'
      and v_existing.refund_of_transaction_id = p_charge_id
      and v_existing.provider_ref = v_provider_ref then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'refundTransactionId', v_existing.id
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'refund_reference_conflict');
  end if;

  insert into public.billing_transactions (
    user_id,
    subscription_id,
    kind,
    amount_cents,
    currency,
    status,
    provider,
    provider_ref,
    idempotency_key,
    description,
    refund_of_transaction_id
  ) values (
    v_charge.user_id,
    v_charge.subscription_id,
    'refund',
    -v_charge.amount_cents,
    v_charge.currency,
    'succeeded',
    'iyzico',
    v_provider_ref,
    v_idempotency_key,
    'iyzico refund recorded by admin',
    v_charge.id
  ) returning id into v_refund_id;

  update public.billing_transactions
    set refund_status = 'refunded',
        refunded_amount_cents = v_charge.amount_cents,
        refunded_at = clock_timestamp()
    where id = v_charge.id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'refundTransactionId', v_refund_id
  );
exception when unique_violation then
  select * into v_existing
  from public.billing_transactions
  where kind = 'refund'
    and provider = 'iyzico'
    and provider_ref = v_provider_ref
  limit 1;

  if found and v_existing.refund_of_transaction_id = p_charge_id then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'refundTransactionId', v_existing.id
    );
  end if;

  if found then
    return jsonb_build_object('ok', false, 'error', 'refund_reference_conflict');
  end if;

  select * into v_existing
  from public.billing_transactions
  where refund_of_transaction_id = p_charge_id
    and kind = 'refund'
    and status = 'succeeded'
  limit 1;

  if found then
    return jsonb_build_object('ok', false, 'error', 'refund_already_recorded');
  end if;

  return jsonb_build_object('ok', false, 'error', 'refund_reference_conflict');
end;
$$;

revoke all on function public.record_iyzico_billing_refund(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_iyzico_billing_refund(uuid, text, text) to service_role;

comment on column public.domain_renewals.expiry_sync_pending is
  'A completed renewal whose registrar expiry has not yet been copied to custom_domains.expires_at.';
comment on column public.billing_transactions.refund_status is
  'Refund status summary for a successful charge; full-refund recording is handled by service-role RPC.';
comment on column public.billing_transactions.refund_of_transaction_id is
  'The original charge for this refund transaction, used for precise referral commission reversals.';

commit;

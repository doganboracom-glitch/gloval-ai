-- NOT APPLIED: referral commissions, immutable payout ledger, and notification throttling.
-- Apply manually only after reviewing against the target schema; requires 095, 096, 097, and 098.
-- This draft does not execute against any database.

begin;

alter table public.referral_partners
  add column if not exists preferred_language text not null default 'tr'
    check (preferred_language in ('tr', 'en')),
  add column if not exists tax_verified_at timestamptz,
  add column if not exists tax_verified_by uuid references auth.users(id) on delete set null;

create table if not exists public.referral_payout_requests (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete restrict,
  method text not null check (method in ('cash', 'credit')),
  balance_cents bigint not null check (balance_cents >= 0),
  payout_cents bigint not null check (payout_cents >= 0),
  credit_amount integer,
  system_topup_cents bigint not null default 0 check (system_topup_cents between 0 and 299),
  invoice_required boolean not null default false,
  invoice_confirmed boolean not null default false,
  invoice_reference text check (invoice_reference is null or char_length(btrim(invoice_reference)) between 2 and 200),
  invoice_received_at timestamptz,
  payment_reference text check (payment_reference is null or char_length(btrim(payment_reference)) between 2 and 200),
  admin_note text check (admin_note is null or char_length(btrim(admin_note)) between 3 and 500),
  tax_status_snapshot text check (tax_status_snapshot in ('individual', 'company')),
  payee_name_snapshot text,
  iban_last4_snapshot text check (iban_last4_snapshot is null or iban_last4_snapshot ~ '^[0-9]{4}$'),
  status text not null check (status in ('requested', 'processed', 'rejected')),
  idempotency_key uuid not null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  rejection_reason text check (rejection_reason is null or rejection_reason in ('admin_rejected', 'details_incomplete', 'compliance_review')),
  unique (partner_id, idempotency_key),
  check (not invoice_required or (method = 'cash' and tax_status_snapshot = 'company')),
  check (not invoice_confirmed or (invoice_required and invoice_reference is not null and invoice_received_at is not null)),
  check (
    (method = 'cash' and credit_amount is null and system_topup_cents = 0)
    or (method = 'credit' and credit_amount > 0 and payout_cents = balance_cents)
  )
);

create index if not exists referral_payout_requests_partner_status_idx
  on public.referral_payout_requests (partner_id, status, requested_at desc);
create index if not exists referral_payout_requests_status_requested_idx
  on public.referral_payout_requests (status, requested_at desc);
create unique index if not exists referral_one_open_cash_request_per_partner_idx
  on public.referral_payout_requests (partner_id)
  where method = 'cash' and status = 'requested';

create table if not exists public.referral_commissions (
  id uuid primary key default gen_random_uuid(),
  attribution_id uuid not null references public.referral_attributions(id) on delete restrict,
  partner_id uuid not null references public.referral_partners(id) on delete restrict,
  billing_transaction_id uuid not null references public.billing_transactions(id) on delete restrict,
  payout_request_id uuid references public.referral_payout_requests(id) on delete restrict,
  gross_cents bigint not null check (gross_cents > 0),
  net_cents bigint not null check (net_cents >= 0),
  commission_cents bigint not null check (commission_cents >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'available', 'requested', 'converted', 'paid', 'reversed')),
  paid_at timestamptz not null,
  available_at timestamptz not null,
  reversed_at timestamptz,
  reversal_kind text check (reversal_kind in ('pre_hold', 'post_hold')),
  reversal_reason text check (reversal_reason is null or reversal_reason in ('payment_status_changed', 'refund_or_chargeback')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attribution_id),
  unique (billing_transaction_id),
  check ((status = 'reversed') = (reversed_at is not null))
);

create index if not exists referral_commissions_partner_status_idx
  on public.referral_commissions (partner_id, status, available_at);
create index if not exists referral_commissions_available_at_idx
  on public.referral_commissions (available_at)
  where status = 'pending';

create or replace function public.referral_commission_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.referral_commission_touch_updated_at() from public, anon, authenticated;
grant execute on function public.referral_commission_touch_updated_at() to service_role;

drop trigger if exists referral_commissions_touch_updated_at on public.referral_commissions;
create trigger referral_commissions_touch_updated_at
before update on public.referral_commissions
for each row execute function public.referral_commission_touch_updated_at();

-- Ledger rows are append-only. Refunds before the hold expires add an equal
-- negative pending entry; later refunds remain negative and may create debt.
create table if not exists public.referral_commission_ledger (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete restrict,
  commission_id uuid references public.referral_commissions(id) on delete restrict,
  payout_request_id uuid references public.referral_payout_requests(id) on delete restrict,
  billing_transaction_id uuid references public.billing_transactions(id) on delete restrict,
  entry_type text not null check (entry_type in (
    'commission', 'refund_pre_hold', 'refund_adjustment', 'payout_request', 'payout_rejection'
  )),
  amount_cents bigint not null check (amount_cents <> 0),
  available_at timestamptz not null,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists referral_commission_ledger_partner_available_idx
  on public.referral_commission_ledger (partner_id, available_at, created_at);
create index if not exists referral_commission_ledger_request_idx
  on public.referral_commission_ledger (payout_request_id)
  where payout_request_id is not null;

create table if not exists public.referral_payout_audit_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete restrict,
  payout_request_id uuid references public.referral_payout_requests(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists referral_payout_audit_partner_created_idx
  on public.referral_payout_audit_events (partner_id, created_at desc);
create index if not exists referral_payout_audit_request_created_idx
  on public.referral_payout_audit_events (payout_request_id, created_at desc)
  where payout_request_id is not null;

create table if not exists public.referral_notification_windows (
  partner_id uuid primary key references public.referral_partners(id) on delete cascade,
  window_started_at timestamptz not null,
  individual_count integer not null default 0 check (individual_count between 0 and 5),
  digest_count integer not null default 0 check (digest_count >= 0),
  digest_notification_id uuid,
  updated_at timestamptz not null default now()
);

alter table public.referral_payout_requests enable row level security;
alter table public.referral_commissions enable row level security;
alter table public.referral_commission_ledger enable row level security;
alter table public.referral_payout_audit_events enable row level security;
alter table public.referral_notification_windows enable row level security;

revoke all on table public.referral_payout_requests from public, anon, authenticated;
revoke all on table public.referral_commissions from public, anon, authenticated;
revoke all on table public.referral_commission_ledger from public, anon, authenticated;
revoke all on table public.referral_payout_audit_events from public, anon, authenticated;
revoke all on table public.referral_notification_windows from public, anon, authenticated;

grant select, insert, update on table public.referral_payout_requests to service_role;
grant select, insert, update on table public.referral_commissions to service_role;
grant select, insert on table public.referral_commission_ledger to service_role;
grant select, insert on table public.referral_payout_audit_events to service_role;
grant select, insert, update on table public.referral_notification_windows to service_role;

create or replace function public.referral_commission_ledger_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'referral commission ledger is append-only';
end;
$$;

revoke all on function public.referral_commission_ledger_immutable() from public, anon, authenticated;
grant execute on function public.referral_commission_ledger_immutable() to service_role;

drop trigger if exists referral_commission_ledger_immutable_trigger on public.referral_commission_ledger;
create trigger referral_commission_ledger_immutable_trigger
before update or delete on public.referral_commission_ledger
for each row execute function public.referral_commission_ledger_immutable();

create or replace function public.referral_record_commission_for_transaction(p_transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.billing_transactions%rowtype;
  v_attribution public.referral_attributions%rowtype;
  v_paid_at timestamptz := clock_timestamp();
  v_available_at timestamptz;
  v_net_cents bigint;
  v_commission_cents bigint;
  v_commission_id uuid;
  v_language text;
begin
  select transaction_row.*
    into v_transaction
    from public.billing_transactions as transaction_row
    where transaction_row.id = p_transaction_id;

  if not found
    or v_transaction.user_id is null
    or v_transaction.kind <> 'charge'
    or v_transaction.status <> 'succeeded'
    or v_transaction.subscription_id is null
    or v_transaction.amount_cents <= 0 then
    return false;
  end if;

  select attribution.*
    into v_attribution
    from public.referral_attributions as attribution
    where attribution.referred_user_id = v_transaction.user_id
    for update;

  if not found or v_transaction.created_at < v_attribution.created_at then
    return false;
  end if;

  -- The first succeeded subscription charge after attribution is the only
  -- commissionable sale. A unique attribution row is the final race guard.
  if exists (
    select 1
    from public.billing_transactions as earlier
    where earlier.user_id = v_transaction.user_id
      and earlier.subscription_id is not null
      and earlier.kind = 'charge'
      and earlier.amount_cents > 0
      and earlier.status = 'succeeded'
      and earlier.created_at >= v_attribution.created_at
      and (earlier.created_at, earlier.id) < (v_transaction.created_at, v_transaction.id)
  ) then
    return false;
  end if;

  v_net_cents := floor(v_transaction.amount_cents::numeric / 1.20)::bigint;
  v_commission_cents := floor(v_net_cents::numeric * 0.20)::bigint;
  v_available_at := v_paid_at + interval '14 days';

  insert into public.referral_commissions (
    attribution_id,
    partner_id,
    billing_transaction_id,
    gross_cents,
    net_cents,
    commission_cents,
    status,
    paid_at,
    available_at
  ) values (
    v_attribution.id,
    v_attribution.partner_id,
    v_transaction.id,
    v_transaction.amount_cents,
    v_net_cents,
    v_commission_cents,
    case when v_commission_cents = 0 then 'available' else 'pending' end,
    v_paid_at,
    v_available_at
  )
  on conflict do nothing
  returning id into v_commission_id;

  if v_commission_id is null then
    return false;
  end if;

  if v_commission_cents > 0 then
    insert into public.referral_commission_ledger (
      partner_id, commission_id, billing_transaction_id, entry_type,
      amount_cents, available_at, dedupe_key
    ) values (
      v_attribution.partner_id,
      v_commission_id,
      v_transaction.id,
      'commission',
      v_commission_cents,
      v_available_at,
      'commission:' || v_commission_id::text
    );
  end if;

  select partner.preferred_language
    into v_language
    from public.referral_partners as partner
    where partner.id = v_attribution.partner_id;

  -- Email enqueue is best-effort and isolated from the payment transaction.
  begin
    insert into public.notification_logs (
      user_id, channel, type, subject, body, status, dedupe_key
    ) values (
      null,
      'email',
      'referral_commission_earned',
      case when v_language = 'en' then 'A referral commission was earned' else 'Yönlendirme komisyonu kazanıldı' end,
      jsonb_build_object(
        'lang', case when v_language = 'en' then 'en' else 'tr' end,
        'attempts', 0,
        'partnerId', v_attribution.partner_id,
        'commissionId', v_commission_id,
        'commissionCents', v_commission_cents,
        'availableAt', v_available_at
      )::text,
      'queued',
      'referral_commission_earned:' || v_commission_id::text
    ) on conflict (dedupe_key) do nothing;
  exception when others then
    null;
  end;

  return true;
end;
$$;

revoke all on function public.referral_record_commission_for_transaction(uuid) from public, anon, authenticated;
grant execute on function public.referral_record_commission_for_transaction(uuid) to service_role;

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
        where refund_row.kind in ('refund', 'chargeback')
          and refund_row.status = 'succeeded'
          and refund_row.subscription_id = original.subscription_id
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
          where refund_row.kind in ('refund', 'chargeback')
            and refund_row.status = 'succeeded'
            and refund_row.subscription_id = original.subscription_id
        )
      )
      and (
        p_transaction_id is null
        or original.id = p_transaction_id
        or exists (
          select 1
          from public.billing_transactions as refund_row
          where refund_row.id = p_transaction_id
            and refund_row.kind in ('refund', 'chargeback')
            and refund_row.status = 'succeeded'
            and refund_row.subscription_id = original.subscription_id
        )
      )
    for update of commission
  loop
    v_reversed_at := clock_timestamp();
    v_pre_hold := v_commission.available_at > v_reversed_at;
    v_reason := case
      when v_commission.has_refund then 'refund_or_chargeback'
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

create or replace function public.referral_sync_commissions(p_partner_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_created integer := 0;
  v_reversed integer := 0;
  v_matured integer := 0;
begin
  for v_transaction_id in
    select transaction_row.id
    from public.billing_transactions as transaction_row
    join public.referral_attributions as attribution
      on attribution.referred_user_id = transaction_row.user_id
    where transaction_row.kind = 'charge'
      and transaction_row.status = 'succeeded'
      and transaction_row.subscription_id is not null
      and transaction_row.amount_cents > 0
      and (p_partner_id is null or attribution.partner_id = p_partner_id)
      and not exists (
        select 1
        from public.referral_commissions as existing_commission
        where existing_commission.billing_transaction_id = transaction_row.id
          or existing_commission.attribution_id = attribution.id
      )
    order by transaction_row.created_at asc, transaction_row.id asc
    limit 500
  loop
    if public.referral_record_commission_for_transaction(v_transaction_id) then
      v_created := v_created + 1;
    end if;
  end loop;

  v_reversed := public.referral_sync_commission_reversals(p_partner_id, null);

  update public.referral_commissions
    set status = 'available'
    where status = 'pending'
      and available_at <= clock_timestamp()
      and (p_partner_id is null or partner_id = p_partner_id);
  get diagnostics v_matured = row_count;

  return jsonb_build_object(
    'ok', true,
    'created', v_created,
    'reversed', v_reversed,
    'matured', v_matured
  );
end;
$$;

revoke all on function public.referral_sync_commissions(uuid) from public, anon, authenticated;
grant execute on function public.referral_sync_commissions(uuid) to service_role;

create or replace function public.referral_handle_billing_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'charge' and new.status = 'succeeded' then
    begin
      perform public.referral_record_commission_for_transaction(new.id);
    exception when others then
      raise warning 'referral commission sync deferred for transaction %', new.id;
    end;
  end if;

  if new.kind in ('refund', 'chargeback') and new.status = 'succeeded'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    begin
      perform public.referral_sync_commission_reversals(null, new.id);
    exception when others then
      raise warning 'referral commission reversal sync deferred for transaction %', new.id;
    end;
  elsif tg_op = 'UPDATE'
    and old.kind = 'charge'
    and old.status = 'succeeded'
    and new.status <> 'succeeded' then
    begin
      perform public.referral_sync_commission_reversals(null, new.id);
    exception when others then
      raise warning 'referral commission reversal sync deferred for transaction %', new.id;
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.referral_handle_billing_transaction() from public, anon, authenticated;
grant execute on function public.referral_handle_billing_transaction() to service_role;

drop trigger if exists referral_billing_transaction_commission on public.billing_transactions;
create trigger referral_billing_transaction_commission
after insert or update of status, kind, amount_cents, subscription_id, user_id
on public.billing_transactions
for each row execute function public.referral_handle_billing_transaction();

create or replace function public.referral_flush_commission_before_user_detach()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is not null
    and new.user_id is null
    and old.kind = 'charge'
    and old.status = 'succeeded'
    and old.subscription_id is not null
    and old.amount_cents > 0 then
    perform public.referral_record_commission_for_transaction(old.id);
  end if;

  return new;
end;
$$;

revoke all on function public.referral_flush_commission_before_user_detach() from public, anon, authenticated;
grant execute on function public.referral_flush_commission_before_user_detach() to service_role;

drop trigger if exists referral_flush_commission_before_user_detach on public.billing_transactions;
create trigger referral_flush_commission_before_user_detach
before update of user_id on public.billing_transactions
for each row
when (old.user_id is not null and new.user_id is null)
execute function public.referral_flush_commission_before_user_detach();

create or replace function public.referral_queue_signup_notification(p_attribution_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner_id uuid;
  v_user_id uuid;
  v_language text;
  v_status text;
  v_now timestamptz := clock_timestamp();
  v_window public.referral_notification_windows%rowtype;
  v_window_found boolean := false;
  v_notification_id uuid;
  v_dedupe_key text;
  v_window_end timestamptz;
  v_next_count integer;
begin
  select partner.id, partner.user_id, partner.preferred_language, partner.status
    into v_partner_id, v_user_id, v_language, v_status
    from public.referral_attributions as attribution
    join public.referral_partners as partner on partner.id = attribution.partner_id
    where attribution.id = p_attribution_id;

  if not found or v_user_id is null or v_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'partner_inactive');
  end if;

  v_dedupe_key := 'referral_partner_signup:' || p_attribution_id::text;
  if exists (
    select 1 from public.notification_logs where dedupe_key = v_dedupe_key
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'dedupeKey', v_dedupe_key);
  end if;

  perform 1
    from public.referral_partners as partner
    where partner.id = v_partner_id
      and partner.status = 'active'
      and partner.user_id is not null
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'partner_inactive');
  end if;

  select window_row.*
    into v_window
    from public.referral_notification_windows as window_row
    where window_row.partner_id = v_partner_id
    for update;
  v_window_found := found;

  if not v_window_found or v_window.window_started_at <= v_now - interval '1 hour' then
    insert into public.referral_notification_windows (
      partner_id, window_started_at, individual_count, digest_count, digest_notification_id, updated_at
    ) values (
      v_partner_id, v_now, 0, 0, null, v_now
    )
    on conflict (partner_id) do update set
      window_started_at = excluded.window_started_at,
      individual_count = 0,
      digest_count = 0,
      digest_notification_id = null,
      updated_at = excluded.updated_at
    returning * into v_window;
  end if;

  v_window_end := v_window.window_started_at + interval '1 hour';

  if v_window.individual_count < 5 then
    v_notification_id := gen_random_uuid();
    insert into public.notification_logs (
      id, user_id, channel, type, subject, body, status, dedupe_key
    ) values (
      v_notification_id,
      null,
      'email',
      'referral_partner_signup',
      case when v_language = 'en' then 'A new customer joined through your link' else 'Yönlendirmenizle yeni kayıt' end,
      jsonb_build_object(
        'lang', case when v_language = 'en' then 'en' else 'tr' end,
        'attempts', 0,
        'partnerId', v_partner_id,
        'attributionId', p_attribution_id
      )::text,
      'queued',
      v_dedupe_key
    ) on conflict (dedupe_key) do nothing;

    update public.referral_notification_windows
      set individual_count = individual_count + 1,
          updated_at = v_now
      where partner_id = v_partner_id;

    return jsonb_build_object(
      'ok', true,
      'type', 'referral_partner_signup',
      'dedupeKey', v_dedupe_key,
      'deferred', false
    );
  end if;

  v_next_count := v_window.digest_count + 1;
  if v_window.digest_notification_id is null then
    v_notification_id := gen_random_uuid();
    v_dedupe_key := 'referral_partner_signup_digest:' || v_notification_id::text;
    insert into public.notification_logs (
      id, user_id, channel, type, subject, body, status, dedupe_key
    ) values (
      v_notification_id,
      null,
      'email',
      'referral_partner_signup_digest',
      case when v_language = 'en' then 'Referral signup summary' else 'Yönlendirme kayıt özeti' end,
      jsonb_build_object(
        'lang', case when v_language = 'en' then 'en' else 'tr' end,
        'attempts', 0,
        'partnerId', v_partner_id,
        'signupCount', v_next_count,
        'windowEndsAt', v_window_end
      )::text,
      'queued',
      v_dedupe_key
    );
    update public.referral_notification_windows
      set digest_count = v_next_count,
          digest_notification_id = v_notification_id,
          updated_at = v_now
      where partner_id = v_partner_id;
  else
    v_notification_id := v_window.digest_notification_id;
    select log_row.dedupe_key
      into v_dedupe_key
      from public.notification_logs as log_row
      where log_row.id = v_notification_id;
    update public.notification_logs
      set body = jsonb_set(body::jsonb, '{signupCount}', to_jsonb(v_next_count))::text
      where id = v_notification_id and status <> 'sent';
    update public.referral_notification_windows
      set digest_count = v_next_count,
          updated_at = v_now
      where partner_id = v_partner_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'type', 'referral_partner_signup_digest',
    'dedupeKey', v_dedupe_key,
    'deferred', true
  );
end;
$$;

revoke all on function public.referral_queue_signup_notification(uuid) from public, anon, authenticated;
grant execute on function public.referral_queue_signup_notification(uuid) to service_role;

create or replace function public.referral_enqueue_signup_notification_after_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.referral_queue_signup_notification(new.id);
  exception when others then
    raise warning 'referral signup notification enqueue failed for attribution %', new.id;
  end;
  return new;
end;
$$;

revoke all on function public.referral_enqueue_signup_notification_after_attribution() from public, anon, authenticated;
grant execute on function public.referral_enqueue_signup_notification_after_attribution() to service_role;

drop trigger if exists referral_attribution_signup_notification on public.referral_attributions;
create trigger referral_attribution_signup_notification
after insert on public.referral_attributions
for each row execute function public.referral_enqueue_signup_notification_after_attribution();

commit;

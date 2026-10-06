-- Paid renewals of registrar-managed domains.
--
-- One row per renewal attempt. The server computes the price (TRY, VAT-inclusive)
-- from the provider's renewal price list; the client never supplies an amount.
-- `baseline_expires_raw` is the provider expiry (verbatim, zone-less) read BEFORE
-- the paid Renew call, so an uncertain outcome can be settled later by checking
-- whether the provider expiry actually moved past it, without ever renewing twice.

create table if not exists public.domain_renewals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  domain text not null,
  tld text not null,
  period_years integer not null check (period_years between 1 and 10),
  status text not null default 'pending_payment' check (status in (
    'pending_payment',
    'payment_verified',
    'renewal_submitting',
    'renewal_reconciliation_required',
    'completed',
    'failed',
    'manual_refund_required',
    'cancelled'
  )),
  price_cents integer not null check (price_cents > 0),
  currency text not null default 'TRY',
  price_snapshot jsonb,
  payment_provider text,
  payment_reference text,
  baseline_expires_raw text,
  provider_expires_raw text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists domain_renewals_payment_reference_key
  on public.domain_renewals (payment_reference)
  where payment_reference is not null;

-- At most one unfinished renewal per user and domain: a double click or a replayed
-- request cannot open a second charge for the same renewal.
create unique index if not exists domain_renewals_one_open_per_domain
  on public.domain_renewals (user_id, domain)
  where status in ('pending_payment', 'payment_verified', 'renewal_submitting', 'renewal_reconciliation_required');

create index if not exists domain_renewals_user_domain_idx
  on public.domain_renewals (user_id, domain, created_at desc);

create index if not exists domain_renewals_status_idx
  on public.domain_renewals (status, updated_at);

alter table public.domain_renewals enable row level security;

-- Owners may read their own renewals. All writes go through the service role.
drop policy if exists "domain_renewals_select_own" on public.domain_renewals;
create policy "domain_renewals_select_own"
  on public.domain_renewals for select
  using (auth.uid() = user_id);

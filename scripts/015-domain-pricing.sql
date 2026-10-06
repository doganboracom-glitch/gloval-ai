-- GLOVAL AI — Domain TL pricing (NOT YET APPLIED to any database).
-- Additive and idempotent: no existing rows are read, updated or deleted.

-- NOTE: Phase 1B prices with a fixed manual rate in code (1 USD = 50 TRY,
-- source `fixed_manual_rate`, not a market rate) and does NOT read this table.
-- It is kept only for a future live-rate feed; applying it is optional.
-- Daily FX rates used to convert registrar costs to TRY. Written only by the
-- server (service role); RLS is on with no policies, so anon/authenticated
-- clients cannot read or write it.
create table if not exists public.fx_rates (
  currency text primary key check (currency = upper(currency) and char_length(currency) = 3),
  -- TRY per 1 unit of `currency`, in millionths (38.5 TRY -> 38500000).
  rate_micros bigint not null check (rate_micros > 0),
  source text not null check (char_length(source) > 0),
  fetched_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.fx_rates enable row level security;

-- Frozen price breakdown for each new order (provider cost, FX rate/source/time,
-- TL cost, margin, VAT, totals). NULL for legacy orders, which are left untouched.
alter table public.domain_orders
  add column if not exists price_snapshot jsonb;

-- 036: store checkout settings (guest checkout, active card provider, cash-on-delivery fee).
-- Idempotent. NOT applied automatically. The application code works without it:
--  * missing settings columns read as their defaults (guest checkout ON, fee 0, PayTR),
--  * saving non-default values before the migration returns a clear "migration pending" error,
--  * a missing orders.cod_fee_cents column is skipped on insert (the fee is still part of
--    total_cents and is derived for display as total - subtotal - shipping).

-- 1) Per-store checkout settings. The table already has RLS enabled; no policy changes
-- are needed because only the service role (after an owner check) touches these columns.
alter table public.ecommerce_payment_settings
  add column if not exists guest_checkout boolean not null default true,
  add column if not exists active_card_provider text not null default 'paytr',
  add column if not exists cod_fee_cents integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ecommerce_payment_settings_cod_fee_range'
  ) then
    alter table public.ecommerce_payment_settings
      add constraint ecommerce_payment_settings_cod_fee_range
      check (cod_fee_cents >= 0 and cod_fee_cents <= 100000);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'ecommerce_payment_settings_active_card_provider'
  ) then
    alter table public.ecommerce_payment_settings
      add constraint ecommerce_payment_settings_active_card_provider
      check (active_card_provider in ('paytr', 'iyzico'));
  end if;
end $$;

-- 2) The cash-on-delivery fee charged on an order, as its own line.
-- total_cents = subtotal_cents + shipping_cents + cod_fee_cents.
alter table public.ecommerce_orders
  add column if not exists cod_fee_cents integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ecommerce_orders_cod_fee_range'
  ) then
    alter table public.ecommerce_orders
      add constraint ecommerce_orders_cod_fee_range
      check (cod_fee_cents >= 0 and cod_fee_cents <= 100000);
  end if;
end $$;

alter table public.ecommerce_payment_settings enable row level security;
alter table public.ecommerce_orders enable row level security;

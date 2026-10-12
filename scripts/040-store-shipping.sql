-- 040: store shipping settings + order shipping/tracking columns.
-- Idempotent, additive, and safe to run as one transaction. Do not run this
-- file against production automatically; review the live-schema check first.

begin;

-- 1) Owner-defined shipping rules live next to the other checkout settings.
alter table public.ecommerce_payment_settings
  add column if not exists shipping_fee_cents integer not null default 0,
  add column if not exists free_shipping_threshold_cents integer,
  add column if not exists default_carrier text,
  add column if not exists delivery_note text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ecommerce_payment_settings_shipping_fee_check') then
    alter table public.ecommerce_payment_settings add constraint ecommerce_payment_settings_shipping_fee_check
      check (shipping_fee_cents >= 0 and shipping_fee_cents <= 100000) not valid;
  end if;
end $$;
alter table public.ecommerce_payment_settings validate constraint ecommerce_payment_settings_shipping_fee_check;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ecommerce_payment_settings_free_threshold_check') then
    alter table public.ecommerce_payment_settings add constraint ecommerce_payment_settings_free_threshold_check
      check (free_shipping_threshold_cents is null or (free_shipping_threshold_cents > 0 and free_shipping_threshold_cents <= 99999999)) not valid;
  end if;
end $$;
alter table public.ecommerce_payment_settings validate constraint ecommerce_payment_settings_free_threshold_check;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ecommerce_payment_settings_delivery_note_check') then
    alter table public.ecommerce_payment_settings add constraint ecommerce_payment_settings_delivery_note_check
      check (delivery_note is null or char_length(delivery_note) <= 80) not valid;
  end if;
end $$;
alter table public.ecommerce_payment_settings validate constraint ecommerce_payment_settings_delivery_note_check;

-- 2) Order-level shipping columns. Existing live columns are preserved.
alter table public.ecommerce_orders
  add column if not exists shipping_status text not null default 'preparing',
  add column if not exists tracking_carrier text,
  add column if not exists tracking_number text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ecommerce_orders'::regclass
      and conname = 'ecommerce_orders_shipping_status_chk'
  ) then
    alter table public.ecommerce_orders
      add constraint ecommerce_orders_shipping_status_chk
      check (shipping_status in ('preparing', 'shipped', 'in_transit', 'delivered', 'cancelled')) not valid;
  end if;
end $$;
alter table public.ecommerce_orders
  validate constraint ecommerce_orders_shipping_status_chk;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ecommerce_orders'::regclass
      and conname = 'ecommerce_orders_tracking_number_chk'
  ) then
    alter table public.ecommerce_orders
      add constraint ecommerce_orders_tracking_number_chk
      check (tracking_number is null or tracking_number ~ '^[A-Za-z0-9-]{6,40}$') not valid;
  end if;
end $$;
alter table public.ecommerce_orders
  validate constraint ecommerce_orders_tracking_number_chk;

commit;

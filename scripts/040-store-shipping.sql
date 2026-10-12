-- 040: store shipping settings + order shipping/tracking columns.
-- Idempotent and additive: safe to re-run, no data is changed or dropped.
-- The app degrades gracefully until this is applied (shipping fee stays 0,
-- the shipping tab shows a "migration pending" notice).

-- 1) Owner-defined shipping rules live next to the other checkout settings.
alter table public.ecommerce_payment_settings
  add column if not exists shipping_fee_cents integer not null default 0,
  add column if not exists free_shipping_threshold_cents integer,
  add column if not exists default_carrier text,
  add column if not exists delivery_note text;

alter table public.ecommerce_payment_settings
  drop constraint if exists ecommerce_payment_settings_shipping_fee_check;
alter table public.ecommerce_payment_settings
  add constraint ecommerce_payment_settings_shipping_fee_check
  check (shipping_fee_cents >= 0 and shipping_fee_cents <= 100000);

alter table public.ecommerce_payment_settings
  drop constraint if exists ecommerce_payment_settings_free_threshold_check;
alter table public.ecommerce_payment_settings
  add constraint ecommerce_payment_settings_free_threshold_check
  check (free_shipping_threshold_cents is null
         or (free_shipping_threshold_cents > 0 and free_shipping_threshold_cents <= 99999999));

alter table public.ecommerce_payment_settings
  drop constraint if exists ecommerce_payment_settings_delivery_note_check;
alter table public.ecommerce_payment_settings
  add constraint ecommerce_payment_settings_delivery_note_check
  check (delivery_note is null or char_length(delivery_note) <= 80);

-- 2) Order-level shipping columns. These already exist on the live database;
--    the statements only matter for a fresh environment.
alter table public.ecommerce_orders
  add column if not exists shipping_status text not null default 'preparing',
  add column if not exists tracking_carrier text,
  add column if not exists tracking_number text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz;

-- Safety net for "payment received but order could not be completed".
--
-- When iyzico confirms a payment but the stock/status step keeps failing, the
-- order is flagged instead of being retried silently forever. The owner sees
-- it in the Orders panel (with the iyzico paymentId) and gets one e-mail; the
-- reconciliation cron keeps retrying until the order completes.
--
-- Additive and idempotent. The application reads these columns defensively, so
-- it keeps working (without the flag) until this script is applied.

alter table public.ecommerce_orders
  add column if not exists settle_attempts integer not null default 0,
  add column if not exists attention_at timestamptz,
  add column if not exists attention_reason text;

-- The reconciliation looks up flagged orders directly; keep that lookup cheap.
create index if not exists ecommerce_orders_attention_idx
  on public.ecommerce_orders (attention_at)
  where attention_at is not null;

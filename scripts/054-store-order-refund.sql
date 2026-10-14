-- Card (iyzico) order cancel / refund state machine.
--
-- Cancelling or refunding a PAID card order first reverses the payment at
-- iyzico; only on success does the order become cancelled + refunded.
--
--   refund_status:  null -> pending -> succeeded
--                                  \-> failed (definitive iyzico refusal, safe to retry)
--   A `pending` row older than the lease is an attempt whose outcome is unknown
--   (crash / timeout): it is retried carefully and never counted as failed.
--
--   refund_items:   progress of the attempt, so a retry never repeats a step
--                   that already succeeded at iyzico:
--                   { "method": "cancel" | "refund", "total": n, "done": [{ "id": "...", "ref": "..." }] }
--   refund_ref:     iyzico reference of the reversal, shown to the owner.
--   refund_error:   short code only (digits / fixed words), never a raw response.
--
-- Additive and idempotent. The application reads these columns defensively, so
-- it keeps working (without refunds) until this script is applied.

alter table public.ecommerce_orders
  add column if not exists refund_status text,
  add column if not exists refund_started_at timestamptz,
  add column if not exists refund_items jsonb,
  add column if not exists refund_ref text,
  add column if not exists refund_error text,
  add column if not exists refunded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ecommerce_orders_refund_status_check'
  ) then
    alter table public.ecommerce_orders
      add constraint ecommerce_orders_refund_status_check
      check (refund_status is null or refund_status in ('pending', 'succeeded', 'failed'));
  end if;
end $$;

-- The follow-up sweep looks up in-flight / completed refunds directly.
create index if not exists ecommerce_orders_refund_status_idx
  on public.ecommerce_orders (refund_status)
  where refund_status is not null;

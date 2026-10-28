-- Migration: payment_reconciliation_abandoned_status (already applied to production)
-- Makes 'abandoned' a valid status on both payment tables and adds a partial
-- index for the pending-payment sweep. The new CHECKs are supersets of the old
-- ones, so existing rows stay valid.

set local lock_timeout = '5s';

alter table public.billing_transactions
  drop constraint billing_transactions_status_check,
  add constraint billing_transactions_status_check
    check (status = any (array['pending'::text, 'succeeded'::text, 'failed'::text, 'abandoned'::text]));

alter table public.addon_purchases
  drop constraint addon_purchases_status_check,
  add constraint addon_purchases_status_check
    check (status = any (array['pending'::text, 'paid'::text, 'granted'::text, 'failed'::text, 'manual_refund_required'::text, 'abandoned'::text]));

create index if not exists billing_transactions_pending_created_idx
  on public.billing_transactions (created_at)
  where status = 'pending';

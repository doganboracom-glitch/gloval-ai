-- 049: record legal consent on store orders.
-- Idempotent. NOT applied automatically; run it by hand.
-- The application works without it: orders are still created, they just don't
-- carry the consent columns (createOrder retries the insert without them).
--
--   legal_accepted_at        when the buyer ticked the distance-sales + KVKK boxes
--   legal_contract_version   "<yyyy-mm-dd>:<template|custom>" of the contract text live at that time

alter table public.ecommerce_orders
  add column if not exists legal_accepted_at timestamptz,
  add column if not exists legal_contract_version text;

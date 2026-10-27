-- 076: checkout consent evidence on platform payment records.
-- Idempotent. NOT applied automatically; run it by hand BEFORE deploying the
-- code that writes these columns (every payment-starting action merges them
-- into the transaction / purchase row it already creates).
--
-- Stored per payment: the three boolean flags, the server timestamp and the
-- consent text version. No IP address, no personal data and no consent text.
-- Nullable on purpose: rows created before this migration carry no evidence.

alter table public.billing_transactions
  add column if not exists consent_version     text,
  add column if not exists consent_pre_info    boolean,
  add column if not exists consent_distance    boolean,
  add column if not exists consent_withdrawal  boolean,
  add column if not exists consented_at        timestamptz;

alter table public.addon_purchases
  add column if not exists consent_version     text,
  add column if not exists consent_pre_info    boolean,
  add column if not exists consent_distance    boolean,
  add column if not exists consent_withdrawal  boolean,
  add column if not exists consented_at        timestamptz;

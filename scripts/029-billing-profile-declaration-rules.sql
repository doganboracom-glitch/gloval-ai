-- 029: Align billing profile validation with declaration-based invoice details.
-- Apply separately after review; this migration is idempotent.
--
-- Both rules below are written WITHOUT backslashes on purpose. When a migration is
-- pasted through a layer that escapes backslashes, '\.' / '\+' silently become a
-- literal backslash and the CHECK rejects every valid value. Postgres validates
-- check constraints alphabetically, so the e-mail rule masks the phone rule.

-- The e-mail CHECK now lives in 029-billing-profile-email-relax.sql (single '@' rule).

alter table public.billing_profiles
  drop constraint if exists billing_profiles_phone_check;

alter table public.billing_profiles
  add constraint billing_profiles_phone_check
    check (phone ~ '^[+][1-9][0-9]{7,14}$');

-- Do not apply this file automatically; deploy only after explicit approval.

-- 029: Align billing profile validation with declaration-based invoice details.
-- Apply separately after review; this migration is idempotent.
--
-- Both rules below are written WITHOUT backslashes on purpose. When a migration is
-- pasted through a layer that escapes backslashes, '\.' / '\+' silently become a
-- literal backslash and the CHECK rejects every valid value. Postgres validates
-- check constraints alphabetically, so the e-mail rule masks the phone rule.

alter table public.billing_profiles
  drop constraint if exists billing_profiles_invoice_email_check;

alter table public.billing_profiles
  add constraint billing_profiles_invoice_email_check
    check (
      invoice_email is not null
      and char_length(btrim(invoice_email)) between 3 and 254
      and position('@' in invoice_email) > 1
      and position('@' in invoice_email) < char_length(invoice_email)
      and invoice_email !~ '[[:space:]]'
    );

alter table public.billing_profiles
  drop constraint if exists billing_profiles_phone_check;

alter table public.billing_profiles
  add constraint billing_profiles_phone_check
    check (phone ~ '^[+][1-9][0-9]{7,14}$');

-- Do not apply this file automatically; deploy only after explicit approval.

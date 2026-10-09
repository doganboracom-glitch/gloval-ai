-- 029: Align billing profile validation with declaration-based invoice details.
-- Apply separately after review; this migration is idempotent.

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

-- Do not apply this file automatically; deploy only after explicit approval.

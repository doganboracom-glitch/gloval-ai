-- 029: Align billing profile validation with declaration-based invoice details.
-- Apply separately after review; this migration is idempotent.

alter table public.billing_profiles
  drop constraint if exists billing_profiles_invoice_email_check,
  drop constraint if exists billing_profiles_address_check,
  drop constraint if exists billing_profiles_district_check,
  drop constraint if exists billing_profiles_city_check;

alter table public.billing_profiles
  add constraint billing_profiles_invoice_email_check
    check (
      invoice_email is not null
      and char_length(btrim(invoice_email)) between 3 and 254
      and position('@' in invoice_email) > 1
      and position('@' in invoice_email) < char_length(invoice_email)
      and invoice_email !~ '[[:space:]]'
    ),
  add constraint billing_profiles_address_check
    check (char_length(btrim(address_line)) between 3 and 240),
  add constraint billing_profiles_district_check
    check (char_length(btrim(district)) between 1 and 100),
  add constraint billing_profiles_city_check
    check (char_length(btrim(city)) between 1 and 100);

-- Do not apply this file automatically; deploy only after explicit approval.

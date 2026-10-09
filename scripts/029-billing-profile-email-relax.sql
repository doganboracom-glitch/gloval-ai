-- 029: Relax the invoice e-mail CHECK to the declaration-based rule.
-- Rule: trimmed length 3..254 and an '@' with at least one character before it.
-- Idempotent. Review and apply separately; do not apply automatically.
--
-- Written WITHOUT regular expressions or backslashes on purpose, so no layer that
-- escapes backslashes can corrupt it.

alter table public.billing_profiles
  drop constraint if exists billing_profiles_invoice_email_check;

alter table public.billing_profiles
  add constraint billing_profiles_invoice_email_check
    check (
      char_length(btrim(invoice_email)) between 3 and 254
      and position('@' in invoice_email) > 1
    );

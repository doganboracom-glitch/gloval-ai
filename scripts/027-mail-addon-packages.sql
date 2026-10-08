-- GLOVAL Mail add-on packages: extra mailboxes sold as monthly add-ons.
-- Idempotent. Widens the entitlement kind check to allow 'mail' and seeds the
-- four catalog rows. The code-side catalog (lib/add-ons.ts) is the price source of truth;
-- these rows exist so the purchase flow can resolve a billing_plans row per code.

alter table public.user_addon_entitlements
  drop constraint if exists user_addon_entitlements_kind_check;

alter table public.user_addon_entitlements
  add constraint user_addon_entitlements_kind_check
  check (kind = any (array['site'::text, 'product'::text, 'mail'::text]));

insert into public.billing_plans
  (code, name, description, price_cents, currency, "interval", trial_days, features, active, sort_order, product_category)
values
  ('extra_mail_1',  'Ek Posta Kutusu (+1)',  'Plan posta kutusu limitine +1 kutu ekler. Ana aboneliğin faturalama dönemiyle birlikte geçerlidir.',  4900, 'TRY', 'month', 0, '[]'::jsonb, true, 25, 'addon'),
  ('extra_mail_10', 'Ek Posta Kutusu (+10)', 'Plan posta kutusu limitine +10 kutu ekler. Ana aboneliğin faturalama dönemiyle birlikte geçerlidir.', 14900, 'TRY', 'month', 0, '[]'::jsonb, true, 26, 'addon'),
  ('extra_mail_25', 'Ek Posta Kutusu (+25)', 'Plan posta kutusu limitine +25 kutu ekler. Ana aboneliğin faturalama dönemiyle birlikte geçerlidir.', 29900, 'TRY', 'month', 0, '[]'::jsonb, true, 27, 'addon'),
  ('extra_mail_50', 'Ek Posta Kutusu (+50)', 'Plan posta kutusu limitine +50 kutu ekler. Ana aboneliğin faturalama dönemiyle birlikte geçerlidir.', 49900, 'TRY', 'month', 0, '[]'::jsonb, true, 28, 'addon')
on conflict (code) do nothing;

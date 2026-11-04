-- UNAPPLIED — apply manually after review; this task does not mutate the live database.
--
-- Yearly add-on SKUs (interval = 'year', one-time charge valid 12 months, no
-- renewal) and the monthly/yearly product-allowance SKUs. Prices are KURUŞ and
-- include VAT; each yearly price is exactly 10 x its monthly price.
--
-- Legacy product SKUs extra_product_100 / _200 / _500 are NOT deleted, only
-- switched off for new sales (active = false). Nobody has bought them in
-- production, but keeping the rows keeps the catalog history intact.
--
-- No begin/commit: every statement is idempotent (on conflict (code) do nothing,
-- and the UPDATE only touches rows that are still active).

update public.billing_plans
set active = false
where product_category = 'addon'
  and code in ('extra_product_100', 'extra_product_200', 'extra_product_500')
  and active is distinct from false;

insert into public.billing_plans (
  code,
  name,
  description,
  price_cents,
  currency,
  interval,
  trial_days,
  features,
  active,
  sort_order,
  product_category
)
values
  -- Yearly: 12 months from purchase, charged once, never auto-renewed.
  (
    'extra_corporate_site_1_yearly',
    'Ek Site (Kurumsal) - Yıllık',
    'Yıllık ek kapasite: 1 kurumsal site. Satın alma tarihinden itibaren 12 ay geçerlidir, otomatik yenilenmez.',
    199000,
    'TRY',
    'year',
    0,
    '[]'::jsonb,
    true,
    42,
    'addon'
  ),
  (
    'extra_ecommerce_site_1_yearly',
    'E-Ticaret Sitesi - Yıllık',
    'Yıllık ek kapasite: 1 e-ticaret sitesi. Satın alma tarihinden itibaren 12 ay geçerlidir, otomatik yenilenmez.',
    499000,
    'TRY',
    'year',
    0,
    '[]'::jsonb,
    true,
    43,
    'addon'
  ),
  (
    'extra_mail_1_yearly',
    'Ek Posta Kutusu (+1) - Yıllık',
    'Yıllık ek kapasite: 1 posta kutusu. Satın alma tarihinden itibaren 12 ay geçerlidir, otomatik yenilenmez.',
    49000,
    'TRY',
    'year',
    0,
    '[]'::jsonb,
    true,
    30,
    'addon'
  ),
  (
    'extra_mail_5_yearly',
    'Ek Posta Kutusu Paketi - Yıllık',
    'Yıllık ek kapasite: 5 posta kutusu. Satın alma tarihinden itibaren 12 ay geçerlidir, otomatik yenilenmez.',
    199000,
    'TRY',
    'year',
    0,
    '[]'::jsonb,
    true,
    31,
    'addon'
  ),
  (
    'extra_product_50_yearly',
    'Ek Ürün (+50) - Yıllık',
    'Yıllık ek kapasite: 50 ürün. Satın alma tarihinden itibaren 12 ay geçerlidir, otomatik yenilenmez.',
    199000,
    'TRY',
    'year',
    0,
    '[]'::jsonb,
    true,
    45,
    'addon'
  ),
  (
    'extra_ecommerce_product_100_yearly',
    'Ek Ürün (+100) - Yıllık',
    'Yıllık ek kapasite: 100 ürün. Satın alma tarihinden itibaren 12 ay geçerlidir, otomatik yenilenmez.',
    349000,
    'TRY',
    'year',
    0,
    '[]'::jsonb,
    true,
    47,
    'addon'
  ),
  -- Monthly: valid until the end of the main subscription period they were bought in.
  (
    'extra_product_50',
    'Ek Ürün (+50)',
    'Aylık ek kapasite: 50 ürün. Ana aboneliğin faturalama dönemiyle birlikte geçerlidir.',
    19900,
    'TRY',
    'month',
    0,
    '[]'::jsonb,
    true,
    44,
    'addon'
  ),
  (
    'extra_ecommerce_product_100',
    'Ek Ürün (+100)',
    'Aylık ek kapasite: 100 ürün. Ana aboneliğin faturalama dönemiyle birlikte geçerlidir.',
    34900,
    'TRY',
    'month',
    0,
    '[]'::jsonb,
    true,
    46,
    'addon'
  )
on conflict (code) do nothing;

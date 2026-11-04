-- UNAPPLIED — apply manually after review; this task does not mutate the live database.
-- Preserve legacy catalog rows and grants; only disable discontinued SKUs for new sales.

update public.billing_plans
set active = false
where product_category = 'addon'
  and code in (
    'extra_site_1',
    'extra_site_3',
    'extra_site_5',
    'extra_mail_10',
    'extra_mail_25',
    'extra_mail_50'
  )
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
  (
    'extra_corporate_site_1',
    'Ek Site (Kurumsal)',
    'Aylık ek kapasite: 1 kurumsal site.',
    19900,
    'TRY',
    'month',
    0,
    '[]'::jsonb,
    true,
    40,
    'addon'
  ),
  (
    'extra_ecommerce_site_1',
    'E-Ticaret Sitesi',
    'Aylık ek kapasite: 1 e-ticaret sitesi.',
    49900,
    'TRY',
    'month',
    0,
    '[]'::jsonb,
    true,
    41,
    'addon'
  ),
  (
    'extra_mail_5',
    'Ek Posta Kutusu Paketi',
    'Aylık ek kapasite: 5 posta kutusu.',
    19900,
    'TRY',
    'month',
    0,
    '[]'::jsonb,
    true,
    29,
    'addon'
  )
on conflict (code) do nothing;

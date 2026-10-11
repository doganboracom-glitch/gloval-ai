begin;

alter table public.ecommerce_products
  add column if not exists compare_at_price_cents integer,
  add column if not exists vat_rate smallint not null default 20,
  add column if not exists specs jsonb not null default '[]'::jsonb,
  add column if not exists shipping_note text,
  add column if not exists seo_title text,
  add column if not exists seo_description text;

alter table public.ecommerce_order_items
  add column if not exists vat_rate smallint,
  add column if not exists vat_cents integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ecommerce_products_compare_at_price_check') then
    alter table public.ecommerce_products add constraint ecommerce_products_compare_at_price_check check (compare_at_price_cents is null or compare_at_price_cents > price_cents);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ecommerce_products_vat_rate_check') then
    alter table public.ecommerce_products add constraint ecommerce_products_vat_rate_check check (vat_rate in (0,1,10,20));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ecommerce_products_specs_array_check') then
    alter table public.ecommerce_products add constraint ecommerce_products_specs_array_check check (jsonb_typeof(specs) = 'array');
  end if;
end $$;

alter table public.ecommerce_products enable row level security;
alter table public.ecommerce_order_items enable row level security;

commit;

-- RPC yeniden oluşturma notu: canlı get_store_products tanımının mevcut RETURNS TABLE
-- listesine compare_at_price_cents, vat_rate, specs, shipping_note, seo_title ve
-- seo_description sütunları eklenmelidir. Canlı imza burada bilinçli olarak
-- değiştirilmemiştir; uygulama SQL uygulanmadan da eski RPC ile çalışır.

-- Uygulanmadı; yalnızca gösterim için oluşturuldu.

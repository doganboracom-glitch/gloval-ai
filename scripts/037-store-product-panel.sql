-- 037: Urun paneli veri katmani (eski fiyat, KDV, ozellikler, gonderim notu, SEO).
-- UYGULANMADI; yalnizca gosterim icindir. RLS durumu bu dosyada DEGISTIRILMEZ.

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
  if not exists (
    select 1 from pg_constraint
     where conname = 'ecommerce_products_compare_at_price_check'
       and conrelid = 'public.ecommerce_products'::regclass
  ) then
    alter table public.ecommerce_products
      add constraint ecommerce_products_compare_at_price_check
      check (compare_at_price_cents is null or compare_at_price_cents > price_cents);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'ecommerce_products_vat_rate_check'
       and conrelid = 'public.ecommerce_products'::regclass
  ) then
    alter table public.ecommerce_products
      add constraint ecommerce_products_vat_rate_check
      check (vat_rate in (0, 1, 10, 20));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'ecommerce_products_specs_array_check'
       and conrelid = 'public.ecommerce_products'::regclass
  ) then
    alter table public.ecommerce_products
      add constraint ecommerce_products_specs_array_check
      check (jsonb_typeof(specs) = 'array');
  end if;
end $$;

-- get_store_products: canli tanim (pg_get_functiondef) birebir korunarak yalnizca
-- alti yeni sutun eklendi. Donus tipi degistigi icin drop + create gerekir.
drop function if exists public.get_store_products(text);

create function public.get_store_products(p_slug text)
 returns table(
   id uuid, project_id uuid, name text, slug text, description text,
   price_cents integer, currency text, stock integer, images jsonb,
   category_id uuid, track_stock boolean,
   compare_at_price_cents integer, vat_rate smallint, specs jsonb,
   shipping_note text, seo_title text, seo_description text
 )
 language sql
 security definer
 set search_path to 'public'
as $function$
  select pr.id, pr.project_id, pr.name, pr.slug, pr.description,
         pr.price_cents, pr.currency, pr.stock, pr.images, pr.category_id,
         pr.track_stock,
         pr.compare_at_price_cents, pr.vat_rate, pr.specs,
         pr.shipping_note, pr.seo_title, pr.seo_description
    from public.ecommerce_products pr
    join public.projects p on p.id = pr.project_id
   where p.slug = p_slug
     and p.published = true
     and pr.status = 'active'
   order by pr.sort_order asc, pr.created_at desc;
$function$;

-- Canlidaki yetkiler (PUBLIC, postgres, anon, authenticated, service_role EXECUTE) aynen.
revoke all on function public.get_store_products(text) from public;
grant execute on function public.get_store_products(text) to public;
grant execute on function public.get_store_products(text) to postgres, anon, authenticated, service_role;

commit;

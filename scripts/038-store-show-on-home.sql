-- 038: Ana sayfa vitrini icin "Ana sayfada goster" isareti.
-- UYGULANMADI. RLS durumu bu dosyada DEGISTIRILMEZ. 037 uygulanmis olmali.
-- Uygulanana kadar uygulama bu kolonu yazmaz/okumaz; "Elle seciklerim" vitrini bos kalir.

begin;

alter table public.ecommerce_products
  add column if not exists show_on_home boolean not null default false;

-- get_store_products: 037'deki tanim birebir korunarak yalnizca show_on_home eklendi.
-- Donus tipi degistigi icin drop + create gerekir.
drop function if exists public.get_store_products(text);

create function public.get_store_products(p_slug text)
 returns table(
   id uuid, project_id uuid, name text, slug text, description text,
   price_cents integer, currency text, stock integer, images jsonb,
   category_id uuid, track_stock boolean,
   compare_at_price_cents integer, vat_rate smallint, specs jsonb,
   shipping_note text, seo_title text, seo_description text,
   show_on_home boolean
 )
 language sql
 security definer
 set search_path to 'public'
as $function$
  select pr.id, pr.project_id, pr.name, pr.slug, pr.description,
         pr.price_cents, pr.currency, pr.stock, pr.images, pr.category_id,
         pr.track_stock,
         pr.compare_at_price_cents, pr.vat_rate, pr.specs,
         pr.shipping_note, pr.seo_title, pr.seo_description,
         pr.show_on_home
    from public.ecommerce_products pr
    join public.projects p on p.id = pr.project_id
   where p.slug = p_slug
     and p.published = true
     and pr.status = 'active'
   order by pr.sort_order asc, pr.created_at desc;
$function$;

revoke all on function public.get_store_products(text) from public;
grant execute on function public.get_store_products(text) to public;
grant execute on function public.get_store_products(text) to postgres, anon, authenticated, service_role;

commit;

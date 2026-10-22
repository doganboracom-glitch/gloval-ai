-- 072: ecommerce_products.video_url (katalog urun videosu)
--
-- UYGULANMADI. Onay bekliyor. Idempotent, geriye uyumludur: kolon yoksa uygulama
-- video sekmesini gizler, mevcut urunler etkilenmez. get_store_products RPC'sine
-- DOKUNMAZ; video, sunucuda service role ile ayri okunur.
--
-- Yalnizca YouTube / Vimeo baglantilari kabul edilir (uygulama tarafinda da
-- dogrulanir). Uzunluk siniri veritabaninda da uygulanir.

alter table public.ecommerce_products
  add column if not exists video_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ecommerce_products_video_url_check'
  ) then
    alter table public.ecommerce_products
      add constraint ecommerce_products_video_url_check
      check (
        video_url is null
        or (
          char_length(video_url) <= 300
          and video_url ~* '^https?://([a-z0-9-]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com)/'
        )
      );
  end if;
end $$;

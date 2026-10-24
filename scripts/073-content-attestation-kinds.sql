-- 073: content_attestations.item_kind CHECK kısıtını gerçek öğe türleriyle uyumlu yap.
-- Idempotent. Otomatik UYGULANMAZ; elle çalıştırın.
--
-- Sorun: 059'daki kısıt yalnızca 7 türe izin veriyor, ama yayın kapısı 'info'
-- (hizmet / SSS / duyuru / slider altı kutu maddeleri) ve 'contact' (tespit edilen
-- sahte-görünümlü iletişim değeri "gerçek" onayı) türlerinde de kayıt yazıyor.
-- Bu türler kısıta takılınca INSERT 23514 ile düşüyor, uygulama onayı
-- kaydedemiyor ve güvenli tarafta kalarak yayını reddediyor.
--
-- Mevcut satırlar eski 7 türde olduğundan yeni kısıtla çelişmez.

begin;

alter table public.content_attestations
  drop constraint if exists content_attestations_item_kind_check;

alter table public.content_attestations
  add constraint content_attestations_item_kind_check
  check (item_kind in ('testimonials','stats','pricing','discount','badge','trust','product','info','contact'));

commit;

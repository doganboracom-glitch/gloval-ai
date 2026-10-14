-- 051: iletişim mesajlarına "okundu" işareti (panel üst menüsündeki okunmamış sayı rozeti).
-- Idempotent. Otomatik UYGULANMAZ; elle çalıştırın.
-- Uygulama bu kolon olmadan da çalışır: rozet gösterilmez, mesaj listesi etkilenmez.
--
--   read_at  NULL = okunmadı. Sahibi Mesajlar sayfasını açınca doldurulur.
--
-- Kısmi indeks yalnızca okunmamış satırları kapsar; rozet sorgusu proje başına tek hızlı sayım yapar.

begin;

alter table public.site_contact_messages
  add column if not exists read_at timestamptz;

create index if not exists site_contact_messages_unread_idx
  on public.site_contact_messages (project_id)
  where read_at is null;

commit;

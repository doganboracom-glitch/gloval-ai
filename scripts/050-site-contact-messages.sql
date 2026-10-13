-- 050: yayınlanmış sitelerdeki "İletişim" formundan gelen mesajlar.
-- Idempotent. Otomatik UYGULANMAZ; elle çalıştırın.
-- Uygulama bu tablo olmadan da çalışır: form hata verir, sitenin geri kalanı etkilenmez.
--
-- Erişim modeli: tabloya anon/authenticated rolleri HİÇ erişemez (politika yok, yetki yok).
-- Yazma ve okuma yalnızca sunucudaki service-role istemcisiyle yapılır; sahiplik kontrolü
-- (projects.owner_id = oturumdaki kullanıcı) uygulama katmanında, her sorguda yeniden yapılır.
--
--   ip_hash       HMAC ile tuzlanmış IP özeti. Ham IP asla saklanmaz.
--   email_status  pending | sent | failed | skipped  (e-posta gitmese de kayıt tutulur)
--   Saklama süresi: 180 gün; günlük cron eski kayıtları siler.

begin;

create table if not exists public.site_contact_messages (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  name         text not null check (char_length(name) between 2 and 80),
  email        text not null check (char_length(email) between 3 and 254),
  phone        text check (phone is null or char_length(phone) <= 20),
  message      text not null check (char_length(message) between 10 and 2000),
  ip_hash      text not null,
  email_status text not null default 'pending'
               check (email_status in ('pending', 'sent', 'failed', 'skipped')),
  created_at   timestamptz not null default now()
);

create index if not exists site_contact_messages_project_created_idx
  on public.site_contact_messages (project_id, created_at desc);

create index if not exists site_contact_messages_ip_created_idx
  on public.site_contact_messages (ip_hash, created_at desc);

create index if not exists site_contact_messages_created_idx
  on public.site_contact_messages (created_at);

alter table public.site_contact_messages enable row level security;
alter table public.site_contact_messages force row level security;

-- Politika tanımlanmaz: RLS açık + politika yok = anon/authenticated için tam ret.
-- Yetkiler de açıkça geri alınır (savunma derinliği).
revoke all on table public.site_contact_messages from anon;
revoke all on table public.site_contact_messages from authenticated;
revoke all on table public.site_contact_messages from public;

grant select, insert, update, delete on table public.site_contact_messages to service_role;

commit;

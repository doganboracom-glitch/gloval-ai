-- 058: ödeme başlatma hatası sayacı (küçük, kalıcı, kişisel veri içermez).
-- Idempotent. Otomatik UYGULANMAZ; elle çalıştırın.
-- Uygulama bu tablo olmadan da çalışır: kayıt sessizce atlanır, ödeme akışı etkilenmez.
--
-- Amaç: Hobby planında çalışma günlükleri ~1 saat tutulur. Hangi akışın (abonelik,
-- paket değişimi, yenileme, ek paket, marka kaldırma, eklenti) hangi nedenle ödeme
-- sayfasını açamadığını (sağlayıcı hazır değil, ortam değişkeni eksik, alıcı bilgisi
-- geçersiz, iyzico reddi, ağ/zaman aşımı) günler sonra da görebilmek için.
--
-- KİŞİSEL VERİ YOK: kullanıcı kimliği, e-posta, telefon, sipariş referansı ve
-- sağlayıcı yanıtı saklanmaz; yalnızca akış, sağlayıcı, ortam, hata kodu ve zaman.
-- Erişim: anon/authenticated HİÇ erişemez (RLS açık, politika yok, yetki yok).
-- Saklama süresi: 90 gün (günlük cron'a eklenebilir; elle de silinebilir).

begin;

create table if not exists public.billing_init_failure_events (
  id          bigint generated always as identity primary key,
  flow        text not null check (flow in ('subscribe','change_plan','renew','topup','branding_removal','addon')),
  provider    text not null check (char_length(provider) between 1 and 32),
  environment text not null check (environment in ('production','preview','development','unknown')),
  code        text not null check (char_length(code) between 1 and 80),
  created_at  timestamptz not null default now()
);

create index if not exists billing_init_failure_events_created_at_idx
  on public.billing_init_failure_events (created_at desc);

alter table public.billing_init_failure_events enable row level security;

revoke all on table public.billing_init_failure_events from public, anon, authenticated;
revoke all on sequence public.billing_init_failure_events_id_seq from public, anon, authenticated;

grant select, insert, delete on table public.billing_init_failure_events to service_role;
grant usage, select on sequence public.billing_init_failure_events_id_seq to service_role;

-- Haftalık özet: akış / ortam / kod kırılımında.
create or replace view public.billing_init_failure_weekly
with (security_invoker = true) as
select
  date_trunc('week', created_at)::date as week,
  flow,
  environment,
  code,
  count(*)                             as total
from public.billing_init_failure_events
group by 1, 2, 3, 4;

revoke all on table public.billing_init_failure_weekly from public, anon, authenticated;
grant select on table public.billing_init_failure_weekly to service_role;

commit;

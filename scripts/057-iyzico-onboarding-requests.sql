-- 057: iyzico "Instant" ön başvuru kayıtları (denetim + veritabanı destekli hız sınırı).
-- Idempotent. Otomatik UYGULANMAZ; elle çalıştırın.
-- Uygulama bu tablo olmadan da güvenle çalışır: tablo yoksa özellik KAPALI kalır
-- (kart görünmez, iyzico'ya hiçbir istek gitmez).
--
-- KİŞİSEL VERİ YOK: telefon, e-posta, ad, soyad ve iyzico'nun ham yanıtı
-- saklanmaz. Yalnızca mağaza, kullanıcı kimliği, sonuç durumu, HTTP durum kodu,
-- onay sürümü/zamanı ve istek zamanı tutulur.
--
--   status       submitted     iyzico 2xx döndü
--                failed        iyzico reddetti / ulaşılamadı (ya da istek sürüyor, bkz. http_status)
--                rate_limited  hız sınırı ya da tekrar başvuru nedeniyle iyzico'ya GİDİLMEDİ
--   http_status  NULL  = istek henüz sonuçlanmadı (ayrılmış kayıt, iyzico çağrısından ÖNCE yazılır)
--                0     = HTTP yanıtı alınamadı (ağ hatası / zaman aşımı)
--                diğer = iyzico'nun döndürdüğü durum kodu
--
-- Hız sınırı mantığı (sunucuda): iyzico'ya gitmeden ÖNCE ayrılmış bir satır
-- eklenir ("failed", http_status NULL); ardından yalnızca kendinden ÖNCEKİ (id'si
-- küçük) satırlar sayılır. id sıralaması toplam sıra verdiği için eşzamanlı iki
-- istekten yalnızca biri geçer. Engellenen satır 'rate_limited'e çevrilir ve
-- sayıma girmez. Bu yüzden service_role'e yalnızca iki sütun için UPDATE yetkisi
-- verilir (status, http_status); başka hiçbir sütun değiştirilemez.
--
-- Erişim: anon/authenticated HİÇ erişemez (RLS açık, politika yok, yetki yok).
-- Saklama: hız sınırı penceresi 24 saattir; kayıtlar mağaza silinince silinir.

begin;

create table if not exists public.iyzico_onboarding_requests (
  id               bigint generated always as identity primary key,
  project_id       uuid        not null references public.projects(id) on delete cascade,
  user_id          uuid        not null references auth.users (id) on delete cascade,
  status           text        not null check (status in ('submitted', 'failed', 'rate_limited')),
  http_status      smallint    check (http_status between 0 and 599),
  consent_version  text        not null check (char_length(consent_version) between 1 and 64),
  consent_at       timestamptz not null,
  requested_at     timestamptz not null default now()
);

create index if not exists iyzico_onboarding_requests_project_id_idx
  on public.iyzico_onboarding_requests (project_id, requested_at desc);

create index if not exists iyzico_onboarding_requests_user_id_idx
  on public.iyzico_onboarding_requests (user_id, requested_at desc);

alter table public.iyzico_onboarding_requests enable row level security;

revoke all on table public.iyzico_onboarding_requests from public, anon, authenticated;
revoke all on sequence public.iyzico_onboarding_requests_id_seq from public, anon, authenticated;

revoke all on table public.iyzico_onboarding_requests from service_role;
grant select, insert on table public.iyzico_onboarding_requests to service_role;
grant update (status, http_status) on table public.iyzico_onboarding_requests to service_role;
grant usage, select on sequence public.iyzico_onboarding_requests_id_seq to service_role;

commit;

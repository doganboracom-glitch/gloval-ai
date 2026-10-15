-- 059: örnek içerik onay kayıtları (yayın kapısı).
-- Idempotent. Otomatik UYGULANMAZ; elle çalıştırın.
--
-- Amaç: Yapay zekânın örnek olarak ürettiği yorum, istatistik, indirim/eski fiyat,
-- rozet ve fiyat planlarını (sample=true) sahibi "Bunlar gerçektir, onaylıyorum"
-- diyerek yayınladığında kalıcı bir kayıt bırakmak: kim, ne zaman, hangi öğe, hangi
-- onay metni sürümü.
--
-- KİŞİSEL VERİ YOK: öğenin metni saklanmaz; yalnızca içerik özetinin özeti
-- (content_digest), bölüm türü ve öğe türü. İçerik değişirse özet değişir ve onay
-- kendiliğinden geçersiz olur (yeniden sorulur).
-- Erişim: anon/authenticated HİÇ erişemez (RLS açık, politika yok, yetki yok);
-- yalnızca service_role.
--
-- Uygulama bu tablo olmadan GÜVENLİ tarafta kalır: onay kaydı yazılamazsa yayın
-- yapılmaz ("Tümünü gizle ve yayınla" ve içeriği düzenleyerek yayınlamak çalışır).

begin;

create table if not exists public.content_attestations (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  attested_by       uuid not null,
  attested_at       timestamptz not null default now(),
  section_type      text not null check (char_length(section_type) between 1 and 40),
  item_kind         text not null check (item_kind in ('testimonials','stats','pricing','discount','badge','trust','product')),
  content_digest    text not null check (char_length(content_digest) between 8 and 80),
  statement_version text not null check (char_length(statement_version) between 1 and 40),
  unique (project_id, content_digest, statement_version)
);

create index if not exists content_attestations_project_idx
  on public.content_attestations (project_id);

alter table public.content_attestations enable row level security;

revoke all on table public.content_attestations from public, anon, authenticated;
grant select, insert, delete on table public.content_attestations to service_role;

commit;

-- 056: yapay zekâ üretim gözlemi (küçük, kalıcı sayaç).
-- Idempotent. Otomatik UYGULANMAZ; elle çalıştırın.
-- Uygulama bu tablo olmadan da çalışır: kayıt sessizce atlanır, üretim etkilenmez.
--
-- Amaç: Hobby planında çalışma günlükleri ~1 saat tutulur. Bu tablo, hangi akışın
-- hangi modelde ne sıklıkla ilk denemede, onarımla, yeniden istekle ya da yedek
-- (fallback) siteyle bittiğini haftalık olarak görmeyi sağlar.
--
--   outcome  ok        ilk denemede geçerli çıktı
--            repaired  deterministik onarımla geçerli çıktı
--            retried   ikinci istekle geçerli çıktı
--            fallback  yapay zekâ çıktı veremedi; çağıran yedek yola düştü
--
-- KİŞİSEL VERİ YOK: kullanıcı kimliği, istem, site içeriği ve model çıktısı
-- saklanmaz; yalnızca akış, katman, model, plan kodu, sonuç ve zaman.
-- Erişim: anon/authenticated HİÇ erişemez (RLS açık, politika yok, yetki yok).
-- Yazma ve okuma yalnızca sunucudaki service_role istemcisiyle yapılır.
-- Saklama süresi: 90 gün; günlük cron eski kayıtları siler.

begin;

create table if not exists public.ai_generation_events (
  id          bigint generated always as identity primary key,
  flow        text not null check (char_length(flow) between 1 and 32),
  tier        text not null check (tier in ('standard', 'advanced')),
  model       text not null check (char_length(model) between 1 and 80),
  outcome     text not null check (outcome in ('ok', 'repaired', 'retried', 'fallback')),
  plan_code   text not null check (char_length(plan_code) between 1 and 32),
  created_at  timestamptz not null default now()
);

create index if not exists ai_generation_events_created_at_idx
  on public.ai_generation_events (created_at desc);

alter table public.ai_generation_events enable row level security;

revoke all on table public.ai_generation_events from public, anon, authenticated;
revoke all on sequence public.ai_generation_events_id_seq from public, anon, authenticated;

grant select, insert, delete on table public.ai_generation_events to service_role;
grant usage, select on sequence public.ai_generation_events_id_seq to service_role;

-- Haftalık özet: fallback oranı akış/katman/model kırılımında.
-- security_invoker: görünüm, sorgulayanın yetkisiyle çalışır (RLS delinmez).
create or replace view public.ai_generation_weekly
with (security_invoker = true) as
select
  date_trunc('week', created_at)::date                                   as week,
  flow,
  tier,
  model,
  count(*)                                                               as total,
  count(*) filter (where outcome = 'ok')                                 as ok,
  count(*) filter (where outcome = 'repaired')                           as repaired,
  count(*) filter (where outcome = 'retried')                            as retried,
  count(*) filter (where outcome = 'fallback')                           as fallback,
  round(100.0 * count(*) filter (where outcome = 'fallback') / count(*), 1) as fallback_pct
from public.ai_generation_events
group by 1, 2, 3, 4;

revoke all on table public.ai_generation_weekly from public, anon, authenticated;
grant select on table public.ai_generation_weekly to service_role;

commit;

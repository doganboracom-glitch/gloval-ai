-- scripts/088-projects-client-token.sql
-- *** UYGULANMADI / NOT APPLIED to any database. Review/PR only. ***
-- Elle, ancak PR onaylandıktan sonra çalıştırın.
--
-- Amaç: Aynı üretilen sitenin farklı kanallardan (e-posta doğrulama bağlantısı ile
-- dashboard'daki sessionStorage devri) iki kez projects satırı oluşturmasını önlemek.
--
-- 1) projects.client_token (text, NULL olabilir): tarayıcının tek bir üretilen site için
--    ürettiği idempotency anahtarı. Eski satırlar NULL kalır; geriye dönük doldurma YOK.
-- 2) (owner_id, client_token) üzerinde KISMİ benzersiz indeks, yalnızca client_token doluyken.
--    NULL token'lı satırlar indekse hiç girmez, bu yüzden mevcut veri etkilenmez ve eski
--    istemciler (token göndermeyenler) önceki gibi çalışır. Farklı sahipler aynı token'ı
--    kullanabilir; çakışma yalnızca aynı sahip içinde olur.
-- 3) CHECK: doluysa uzunluk 8..128 (uygulama tarafındaki normalizeClientToken ile aynı sınır).
--
-- Uygulama kodu sütun yokken de çalışır (42703/PGRST204 olursa token'sız ekler), bu yüzden
-- kod ile migrasyonun dağıtım sırası serbesttir; dedupe migrasyon uygulanınca devreye girer.
--
-- Idempotent. Geri alma: 088-projects-client-token.rollback.sql

begin;

set local lock_timeout = '5s';

alter table public.projects
  add column if not exists client_token text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_client_token_length_chk'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_client_token_length_chk
      check (client_token is null or char_length(client_token) between 8 and 128);
  end if;
end
$$;

create unique index if not exists projects_owner_client_token_uidx
  on public.projects (owner_id, client_token)
  where client_token is not null;

commit;

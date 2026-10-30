-- scripts/087-aura-cursor-plan.sql
-- *** UYGULANMADI / NOT APPLIED to any database. Review/PR only. ***
-- Elle, sırayla ve ancak PR onaylandıktan sonra çalıştırın (bkz. PR açıklaması).
--
-- 1) billing_plans: "İmleç Bulutu" (aura_cursor) satırı.
--    500 TL = 50000 kuruş, KDV dahil, tek seferlik (interval = 'once'), site başına
--    (project_entitlements üzerinden), product_category = 'addon'.
--    active = false: eski katalog okuyucuları (getPlans) satırı görmesin; satış
--    AURA_CURSOR_FEATURE_UI=true bayrağıyla açılır (multilang satırıyla aynı yöntem).
-- 2) billing_init_failure_events.flow CHECK (058): 'multilang' ve 'aura_cursor' akışlarını da kabul etsin.
--    Mevcut CHECK yalnızca subscribe/change_plan/renew/topup/branding_removal/addon içerir; 'multilang'
--    zaten eksikti. Kayıt best-effort olduğu için eksiklik ödeme akışını bozmaz, yalnızca bu iki akışın
--    hata sayacı sessizce kaydedilmez. Tablo yoksa (058 uygulanmamışsa) bu adım atlanır.
--
-- project_entitlements için değişiklik GEREKMEZ: code üzerinde CHECK yok, UNIQUE (project_id, code) var,
-- status CHECK 'inactive'|'active'|'revoked', provider serbest metin ('admin_grant' geçerli).
-- site_branding_removed() yalnızca 'branding_removal' koduna bakar; bu dosya ona dokunmaz.
--
-- Idempotent. Geri alma: 087-aura-cursor-plan.rollback.sql

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 1) Katalog satırı ---------------------------------------------------------------
insert into public.billing_plans
  (code, name, description, price_cents, currency, interval, trial_days, features, product_category, active, sort_order)
values (
  'aura_cursor',
  'İmleç Bulutu',
  'Yayındaki sitenizde fare imlecini renkli bir bulut efektiyle takip eden, tek seferlik ve site başına geçerli eklenti.',
  50000,
  'TRY',
  'once',
  0,
  '["Seçtiğiniz sitede imleci takip eden renkli bulut efekti", "500 TL, KDV dahil, tek seferlik, site başına", "En çok 3 renk, yoğunluk ve boyut ayarı", "Değişiklikleriniz anında yayında", "Abonelikten bağımsız, seçtiğiniz site için süresiz geçerli"]'::jsonb,
  'addon',
  false,
  30
)
on conflict (code) do nothing;

-- 2) 058 CHECK genişletme (tablo varsa) ----------------------------------------------
do $$
begin
  if to_regclass('public.billing_init_failure_events') is not null then
    alter table public.billing_init_failure_events
      drop constraint if exists billing_init_failure_events_flow_check;
    alter table public.billing_init_failure_events
      add constraint billing_init_failure_events_flow_check
      check (flow in ('subscribe','change_plan','renew','topup','branding_removal','multilang','aura_cursor','addon'));
  end if;
end $$;

commit;

-- Doğrulama (salt okunur):
--   select code, price_cents, currency, interval, product_category, active from public.billing_plans where code = 'aura_cursor';
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'billing_init_failure_events_flow_check';

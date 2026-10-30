-- scripts/087-aura-cursor-plan.rollback.sql
-- *** UYGULANMADI / NOT APPLIED. ***
-- 087-aura-cursor-plan.sql geri alma. Önce AURA_CURSOR_FEATURE_UI bayrağını kapatın.
--
-- UYARI: satın alınmış veya admin tarafından verilmiş aura_cursor hakları (project_entitlements) SİLİNMEZ;
-- bu dosya yalnızca katalog satırını kaldırır. Hak sahibi siteler efekti kullanmaya devam eder.
-- Eski 058 CHECK'ine dönmek için, tabloda 'multilang'/'aura_cursor' akışlı satır varsa önce o satırlar
-- silinmelidir; aksi halde ADD CONSTRAINT hata verir.

begin;
set local lock_timeout = '5s';

delete from public.billing_plans where code = 'aura_cursor';

do $$
begin
  if to_regclass('public.billing_init_failure_events') is not null then
    delete from public.billing_init_failure_events where flow in ('multilang','aura_cursor');
    alter table public.billing_init_failure_events
      drop constraint if exists billing_init_failure_events_flow_check;
    alter table public.billing_init_failure_events
      add constraint billing_init_failure_events_flow_check
      check (flow in ('subscribe','change_plan','renew','topup','branding_removal','addon'));
  end if;
end $$;

commit;

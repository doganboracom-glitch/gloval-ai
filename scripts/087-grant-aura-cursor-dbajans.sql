-- scripts/087-grant-aura-cursor-dbajans.sql
-- *** UYGULANMADI / NOT APPLIED to any database. Review/PR only. ***
-- Tek seferlik: "dbajans" sitesine İmleç Bulutu hakkını ücretsiz tanımlar.
-- Yönetici arayüzündeki grantSiteAddon eylemiyle aynı sonucu verir:
--   provider = 'admin_grant', amount_cents = 0, billing_transactions satırı YAZILMAZ.
--
-- Proje kimliği salt okunur sorguyla bulundu (slug 'dbajans', yayında, tek eşleşme):
--   project_id = 495b08b1-49e9-4f88-beb1-722c606c808b
--   owner_id   = b0bcbf47-85c1-4c03-ab4d-233bb0db0573
-- Çalıştırmadan önce kimliğin hâlâ aynı siteye ait olduğu aşağıdaki guard ile doğrulanır;
-- eşleşmezse hiçbir satır eklenmez. Mevcut bir hak (ücretli dahil) ASLA ezilmez.
--
-- ÖN KOŞUL: Bu dosya 087-aura-cursor-plan.sql'den bağımsızdır (hak, katalog satırına bağlı değildir),
-- ancak sahibin /billing ekranında hak adını görmesi için o dosya da uygulanmış olmalıdır.
-- Geri alma: 087-grant-aura-cursor-dbajans.rollback.sql

begin;

insert into public.project_entitlements
  (project_id, user_id, code, name, status, provider, provider_ref, amount_cents, currency, granted_at)
select p.id, p.owner_id, 'aura_cursor', 'İmleç Bulutu', 'active', 'admin_grant', 'admin_grant:manual-sql', 0, 'TRY', now()
from public.projects p
where p.id = '495b08b1-49e9-4f88-beb1-722c606c808b'
  and p.slug = 'dbajans'
  and p.owner_id = 'b0bcbf47-85c1-4c03-ab4d-233bb0db0573'
on conflict (project_id, code) do nothing;

-- Denetim satırı (yönetici eylemiyle aynı tablo; tablo/sütun uyuşmazsa bu ekleme başarısız olursa
-- tüm işlem geri alınmasın diye ayrı bir alt işlemde denenir).
do $$
begin
  insert into public.notification_logs (user_id, channel, type, subject, body, status)
  select p.owner_id, 'system', 'site_addon_granted', 'Site hakkı tanımlandı: aura_cursor',
         'Site: ' || p.id || ' · İşlemi yapan: manuel SQL (087-grant-aura-cursor-dbajans.sql)', 'sent'
  from public.projects p
  where p.id = '495b08b1-49e9-4f88-beb1-722c606c808b' and p.slug = 'dbajans';
exception when others then
  raise notice 'audit satırı yazılamadı: %', sqlerrm;
end $$;

commit;

-- Doğrulama (salt okunur):
--   select code, status, provider, amount_cents from public.project_entitlements
--   where project_id = '495b08b1-49e9-4f88-beb1-722c606c808b' and code = 'aura_cursor';

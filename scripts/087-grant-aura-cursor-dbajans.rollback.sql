-- scripts/087-grant-aura-cursor-dbajans.rollback.sql
-- *** UYGULANMADI / NOT APPLIED. ***
-- dbajans'a verilen admin_grant hakkını geri alır. Yalnızca admin_grant olan satır etkilenir;
-- site sahibi bu hakkı ileride satın aldıysa (provider <> 'admin_grant') satıra dokunulmaz.
-- Depolanan efekt (projects.schema_data.effects) silinmez; yayında kalır, yalnızca sahibin düzenleme hakkı kalkar.

begin;

update public.project_entitlements
set status = 'revoked'
where project_id = '495b08b1-49e9-4f88-beb1-722c606c808b'
  and code = 'aura_cursor'
  and provider = 'admin_grant'
  and status = 'active';

commit;

-- scripts/088-projects-client-token.rollback.sql
-- *** UYGULANMADI / NOT APPLIED to any database. Review/PR only. ***
-- 088-projects-client-token.sql dosyasını geri alır. Satırlar silinmez; yalnızca token
-- sütunu ve indeksi kalkar (token değerleri kaybolur, projeler korunur).

begin;

drop index if exists public.projects_owner_client_token_uidx;

alter table public.projects
  drop constraint if exists projects_client_token_length_chk;

alter table public.projects
  drop column if exists client_token;

commit;

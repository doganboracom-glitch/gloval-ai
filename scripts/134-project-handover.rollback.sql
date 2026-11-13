-- scripts/134-project-handover.rollback.sql
-- *** NOT APPLIED to any database. Review/PR only. ***
-- Removes the site handover functions and the audit table of scripts/134-project-handover.sql.
-- Sites that were already handed over STAY with their new owner (no data is moved back).
-- WARNING: dropping project_handover_events permanently deletes the handover audit history.
-- Export it first if it must be kept:  select * from public.project_handover_events;

begin;
set local lock_timeout = '5s';

drop function if exists public.admin_handover_project(uuid,uuid,uuid,text,text,text,boolean);
drop function if exists public.admin_project_handover_preview(uuid,text);
drop function if exists public._ph_target_limits(uuid);

drop trigger if exists phe_no_update_delete on public.project_handover_events;
drop trigger if exists phe_no_truncate on public.project_handover_events;
drop table if exists public.project_handover_events;
drop function if exists public.phe_block_mutation();

commit;

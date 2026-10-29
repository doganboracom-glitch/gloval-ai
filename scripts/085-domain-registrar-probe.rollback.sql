-- scripts/085-domain-registrar-probe.rollback.sql
-- Destroys probe runs and their observation log. Export both tables first if you need the findings.

begin;
set local lock_timeout = '5s';

do $$
begin
  if exists (select 1 from public.domain_registrar_probe_runs
              where status in ('created','backup_saved','change_submitted','restoring','restored',
                               'restore_failed','observing')) then
    raise exception 'rollback aborted: active registrar probe runs exist, finish or abort them first';
  end if;
end $$;

drop function if exists public.purge_registrar_probe_backups();
drop function if exists public.claim_due_registrar_probe_readbacks(integer);
drop table if exists public.domain_registrar_probe_events;
drop table if exists public.domain_registrar_probe_runs;
drop function if exists public.dre_block_mutation();
drop function if exists public.drp_before_update();

commit;

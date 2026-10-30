-- scripts/086-domain-ownership-handover.rollback.sql
-- *** NOT APPLIED. Reverts 086. ***
-- Refuses to run while audit rows exist (unless explicitly confirmed) or any domain is quarantined.
-- To drop the audit history deliberately, run first in the same session:
--   select set_config('app.confirm_drop_handover_audit', 'yes', false);

begin;
set local lock_timeout = '5s';

do $$
begin
  if exists (select 1 from public.domain_handover_events)
     and coalesce(current_setting('app.confirm_drop_handover_audit', true), '') <> 'yes' then
    raise exception 'Audit rows exist. Archive them first, or set app.confirm_drop_handover_audit = yes.';
  end if;
  if exists (select 1 from public.custom_domains where mail_transfer_hold_at is not null) then
    raise exception 'A domain is still quarantined. Release the quarantine first.';
  end if;
end $$;

drop trigger if exists custom_domains_mail_hold_guard on public.custom_domains;
drop function if exists public.custom_domains_mail_hold_guard();

drop function if exists public.handover_registrar_domain(uuid,uuid,uuid,text,text,text,text,jsonb);
drop function if exists public.request_domain_mail_hold_release(uuid,uuid,text,text,text);
drop function if exists public.release_domain_mail_transfer_hold(uuid,uuid,text,text,boolean,text,text,text,jsonb);
drop function if exists public.log_domain_handover_event(uuid,text,text,jsonb);
drop function if exists public._ensure_user_primary(uuid);

drop table if exists public.domain_handover_events;
drop function if exists public.dhe_block_mutation();
drop table if exists public.domain_handover_settings;

drop index if exists public.custom_domains_mail_hold_idx;
alter table public.custom_domains
  drop column if exists mail_transfer_hold_handover_id,
  drop column if exists mail_transfer_hold_at;

commit;

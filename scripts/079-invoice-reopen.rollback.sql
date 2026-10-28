-- 079 rollback: restore the 078 state (no deletes on invoices).
-- Audit rows are append-only and are never deleted: if 'invoice.reopen'
-- rows exist, the old CHECK is re-added NOT VALID so history is kept
-- while new rows are limited to the original list.

begin;
set local lock_timeout = '5s';

revoke delete on table public.invoices from service_role;

drop trigger if exists invoices_block_non_reopenable_delete on public.invoices;
drop function if exists public.invoices_block_non_reopenable_delete();

alter table public.invoice_audit drop constraint if exists invoice_audit_action_check;
alter table public.invoice_audit add constraint invoice_audit_action_check
  check (action in (
    'invoice.upload',
    'invoice.replace',
    'invoice.mark_not_required',
    'invoice.download_admin',
    'invoice.download_customer',
    'invoice.export_csv'
  )) not valid;

commit;

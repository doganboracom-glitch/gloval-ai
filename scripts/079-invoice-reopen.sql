-- 079: allow reopening "not_required" invoices (back to Pending).
-- Adds a guarded DELETE path on public.invoices and the 'invoice.reopen'
-- audit action. Does not modify or delete any existing row.
-- Idempotent.

begin;
set local lock_timeout = '5s';

-- Only 'not_required' rows may ever be deleted. Uploaded invoices keep
-- their record even if a bug or a manual query tries to remove them.
create or replace function public.invoices_block_non_reopenable_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'not_required' then
    raise exception 'only not_required invoices can be deleted (status=%)', old.status
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

revoke all on function public.invoices_block_non_reopenable_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists invoices_block_non_reopenable_delete on public.invoices;
create trigger invoices_block_non_reopenable_delete
  before delete on public.invoices
  for each row execute function public.invoices_block_non_reopenable_delete();

-- The trigger is in place before the privilege is granted.
-- TRUNCATE, REFERENCES and TRIGGER stay revoked.
grant delete on table public.invoices to service_role;

-- Superset of the existing list, so no existing audit row is affected.
alter table public.invoice_audit drop constraint if exists invoice_audit_action_check;
alter table public.invoice_audit add constraint invoice_audit_action_check
  check (action in (
    'invoice.upload',
    'invoice.replace',
    'invoice.mark_not_required',
    'invoice.download_admin',
    'invoice.download_customer',
    'invoice.export_csv',
    'invoice.reopen'
  ));

commit;

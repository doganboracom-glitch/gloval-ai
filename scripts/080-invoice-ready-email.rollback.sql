-- 080 rollback: restore the 079 constraints.
-- Rows are never deleted. If 'invoice_ready' events or 'invoice.email_resend'
-- audit rows exist, the old CHECKs are re-added NOT VALID so history is kept
-- while new rows are limited to the previous lists. The added columns are left
-- in place (nullable, unused) so no data is lost.

begin;
set local lock_timeout = '5s';

drop index if exists public.email_events_invoice_ready_dedupe_uidx;
drop index if exists public.email_events_invoice_idx;

alter table public.email_events drop constraint if exists email_events_scope_check;
alter table public.email_events add constraint email_events_scope_check check (
  ((kind = 'account_welcome') and (project_id is null) and (transition_id is null))
  or ((kind = 'project_first_published') and (project_id is not null) and (transition_id is null))
  or ((kind = 'project_unpublished') and (project_id is not null) and (transition_id is not null))
) not valid;

alter table public.email_events drop constraint if exists email_events_kind_check;
alter table public.email_events add constraint email_events_kind_check check (
  kind in ('account_welcome', 'project_first_published', 'project_unpublished')
) not valid;

alter table public.email_events drop constraint if exists email_events_invoice_fields_check;

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
  )) not valid;

commit;

-- 080: "invoice ready" email on the existing email_events outbox.
-- Additive only: new nullable columns, a new event kind, a dedupe index and
-- the 'invoice.email_resend' audit action. No existing row is modified.
-- Idempotent.

begin;
set local lock_timeout = '5s';

alter table public.email_events
  add column if not exists invoice_id uuid references public.invoices(id) on delete cascade,
  add column if not exists dedupe_key text,
  add column if not exists file_sha256 text,
  add column if not exists attachment_state text,
  add column if not exists attachment_reason text;

alter table public.email_events drop constraint if exists email_events_invoice_fields_check;
alter table public.email_events add constraint email_events_invoice_fields_check check (
  (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$')
  and (attachment_state is null or attachment_state in ('attached', 'omitted'))
  and (attachment_reason is null or attachment_reason ~ '^[a-z0-9_]{1,40}$')
);

alter table public.email_events drop constraint if exists email_events_kind_check;
alter table public.email_events add constraint email_events_kind_check check (
  kind in ('account_welcome', 'project_first_published', 'project_unpublished', 'invoice_ready')
);

alter table public.email_events drop constraint if exists email_events_scope_check;
alter table public.email_events add constraint email_events_scope_check check (
  (kind = 'account_welcome' and project_id is null and transition_id is null and invoice_id is null)
  or (kind = 'project_first_published' and project_id is not null and transition_id is null and invoice_id is null)
  or (kind = 'project_unpublished' and project_id is not null and transition_id is not null and invoice_id is null)
  or (kind = 'invoice_ready' and project_id is null and transition_id is null
      and invoice_id is not null and file_sha256 is not null and dedupe_key is not null)
);

-- One automatic send per invoice and file; resends use a distinct key.
create unique index if not exists email_events_invoice_ready_dedupe_uidx
  on public.email_events (dedupe_key)
  where kind = 'invoice_ready';

create index if not exists email_events_invoice_idx
  on public.email_events (invoice_id, created_at desc)
  where invoice_id is not null;

alter table public.invoice_audit drop constraint if exists invoice_audit_action_check;
alter table public.invoice_audit add constraint invoice_audit_action_check
  check (action in (
    'invoice.upload',
    'invoice.replace',
    'invoice.mark_not_required',
    'invoice.download_admin',
    'invoice.download_customer',
    'invoice.export_csv',
    'invoice.reopen',
    'invoice.email_resend'
  ));

commit;

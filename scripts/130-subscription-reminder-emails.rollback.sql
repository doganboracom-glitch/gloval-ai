begin;

drop index if exists public.email_events_billing_reminder_dedupe_uidx;
alter table public.email_events drop constraint if exists email_events_billing_scope_check;
alter table public.email_events drop constraint if exists email_events_scope_check;

-- Reminder rows must go BEFORE the legacy constraints are restored, otherwise
-- re-adding them would fail validation against existing rows.
delete from public.email_events
where kind in (
  'renewal_upcoming_7d', 'renewal_upcoming_3d', 'renewal_upcoming_1d', 'period_ending_notice',
  'payment_failed', 'payment_failed_day2', 'payment_failed_final', 'subscription_suspended'
);

alter table public.email_events drop constraint if exists email_events_kind_check;
alter table public.email_events
  add constraint email_events_kind_check check (kind in (
    'account_welcome', 'project_first_published', 'project_unpublished', 'invoice_ready'
  ));

-- Restore the exact scope check created by 080-invoice-ready-email.sql.
alter table public.email_events add constraint email_events_scope_check check (
  (kind = 'account_welcome' and project_id is null and transition_id is null and invoice_id is null)
  or (kind = 'project_first_published' and project_id is not null and transition_id is null and invoice_id is null)
  or (kind = 'project_unpublished' and project_id is not null and transition_id is not null and invoice_id is null)
  or (kind = 'invoice_ready' and project_id is null and transition_id is null
      and invoice_id is not null and file_sha256 is not null and dedupe_key is not null)
);

commit;

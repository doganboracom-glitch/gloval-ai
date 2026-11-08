begin;

drop index if exists public.email_events_billing_reminder_dedupe_uidx;
alter table public.email_events drop constraint if exists email_events_billing_scope_check;

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

commit;

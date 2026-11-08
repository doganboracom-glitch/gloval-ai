-- Subscription reminder emails (renewal upcoming, payment failed, suspended).
-- Reuses public.email_events. Rows are keyed by dedupe_key
-- `billing:<subscription_id>:<period_end>:<kind>`, so one reminder per
-- subscription, billing period and kind. Apply BEFORE deploying the code.
begin;

-- 1) Extend the allowed kinds.
alter table public.email_events drop constraint if exists email_events_kind_check;
alter table public.email_events
  add constraint email_events_kind_check check (kind in (
    'account_welcome',
    'project_first_published',
    'project_unpublished',
    'invoice_ready',
    'renewal_upcoming_7d',
    'renewal_upcoming_3d',
    'renewal_upcoming_1d',
    'period_ending_notice',
    'payment_failed',
    'payment_failed_day2',
    'payment_failed_final',
    'subscription_suspended'
  ));

-- 2) Scope: a billing reminder belongs to a user and carries only a dedupe key.
alter table public.email_events drop constraint if exists email_events_billing_scope_check;
alter table public.email_events
  add constraint email_events_billing_scope_check check (
    kind not in (
      'renewal_upcoming_7d', 'renewal_upcoming_3d', 'renewal_upcoming_1d', 'period_ending_notice',
      'payment_failed', 'payment_failed_day2', 'payment_failed_final', 'subscription_suspended'
    )
    or (
      project_id is null
      and transition_id is null
      and invoice_id is null
      and file_sha256 is null
      and dedupe_key is not null
    )
  );

-- 3) At most one row per dedupe key for billing reminders (the insert race guard).
create unique index if not exists email_events_billing_reminder_dedupe_uidx
  on public.email_events (dedupe_key)
  where kind in (
    'renewal_upcoming_7d', 'renewal_upcoming_3d', 'renewal_upcoming_1d', 'period_ending_notice',
    'payment_failed', 'payment_failed_day2', 'payment_failed_final', 'subscription_suspended'
  );

commit;

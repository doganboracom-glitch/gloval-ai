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

-- 2) Scope: migration 080 left an `email_events_scope_check` that only accepts
-- the four legacy kinds, so every reminder insert would be rejected by it.
-- Drop it and recreate it with the SAME four arms plus one arm for reminders:
-- a billing reminder belongs to a user and carries only a dedupe key.
-- (`email_events_billing_scope_check` is a leftover of an earlier draft of this
-- script; it is folded into the arm below, so remove it if it exists.)
alter table public.email_events drop constraint if exists email_events_billing_scope_check;
alter table public.email_events drop constraint if exists email_events_scope_check;
alter table public.email_events add constraint email_events_scope_check check (
  (kind = 'account_welcome' and project_id is null and transition_id is null and invoice_id is null)
  or (kind = 'project_first_published' and project_id is not null and transition_id is null and invoice_id is null)
  or (kind = 'project_unpublished' and project_id is not null and transition_id is not null and invoice_id is null)
  or (kind = 'invoice_ready' and project_id is null and transition_id is null
      and invoice_id is not null and file_sha256 is not null and dedupe_key is not null)
  or (kind in (
        'renewal_upcoming_7d', 'renewal_upcoming_3d', 'renewal_upcoming_1d', 'period_ending_notice',
        'payment_failed', 'payment_failed_day2', 'payment_failed_final', 'subscription_suspended'
      )
      and project_id is null and transition_id is null and invoice_id is null
      and file_sha256 is null and dedupe_key is not null)
);

-- 3) At most one row per dedupe key for billing reminders (the insert race guard).
create unique index if not exists email_events_billing_reminder_dedupe_uidx
  on public.email_events (dedupe_key)
  where kind in (
    'renewal_upcoming_7d', 'renewal_upcoming_3d', 'renewal_upcoming_1d', 'period_ending_notice',
    'payment_failed', 'payment_failed_day2', 'payment_failed_final', 'subscription_suspended'
  );

commit;

-- Lifecycle/payment notifications are sent at most once per event. The unique
-- dedupe_key is claimed by inserting the log row BEFORE the email is sent, so
-- concurrent crons/callbacks cannot both win. Rows without a key are unaffected.
alter table public.notification_logs
  add column if not exists dedupe_key text;

create unique index if not exists notification_logs_dedupe_key_uidx
  on public.notification_logs (dedupe_key)
  where dedupe_key is not null;

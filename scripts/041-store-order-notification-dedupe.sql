-- 041: durable, once-only store order email claims.
-- The key is order + event type only; undoing delivery must not authorize a
-- second delivery email.
begin;

alter table public.notification_logs
  add column if not exists dedupe_key text;

create unique index if not exists notification_logs_dedupe_key_uidx
  on public.notification_logs (dedupe_key)
  where dedupe_key is not null;

commit;

-- Verify after applying:
-- select indexname from pg_indexes
-- where tablename = 'notification_logs'
--   and indexname = 'notification_logs_dedupe_key_uidx';

-- Do not drop this index: it is the production duplicate-email guard.

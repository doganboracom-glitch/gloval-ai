-- 017: safe reconciliation states for registrar uncertainty.
-- REVIEW AND APPLY MANUALLY. This file is intentionally not executed by the app.
-- Single transaction: any failure (guard, constraint or unique index) rolls back everything.
-- It never updates or deletes rows, never changes ownership or payment amounts.
-- Idempotent: safe to re-run.

begin;

-- Fail fast, with a readable message, before touching any constraint or index.
do $$
declare
  bad_orders int;
  bad_transfers int;
  dup_open int;
begin
  select count(*) into bad_orders from public.domain_orders
   where status not in (
     'pending_payment','payment_verified','registration_pending','registration_reconciliation_required',
     'active','registration_failed','manual_refund_required','failed','cancelled');
  if bad_orders > 0 then
    raise exception '017 aborted: % domain_orders row(s) have a status outside the allowed list', bad_orders;
  end if;

  select count(*) into bad_transfers from public.domain_transfers
   where status not in (
     'pending_payment','payment_verified','transfer_submitting','transfer_pending',
     'transfer_reconciliation_required','completed','failed','manual_refund_required','cancelled');
  if bad_transfers > 0 then
    raise exception '017 aborted: % domain_transfers row(s) have a status outside the allowed list', bad_transfers;
  end if;

  select count(*) into dup_open from (
    select 1 from public.domain_transfers
     where status in ('pending_payment','payment_verified','transfer_submitting','transfer_pending','transfer_reconciliation_required')
     group by user_id, domain having count(*) > 1
  ) d;
  if dup_open > 0 then
    raise exception '017 aborted: % (user_id, domain) pair(s) have more than one open transfer; review manually', dup_open;
  end if;
end $$;

alter table public.domain_orders drop constraint if exists domain_orders_status_check;
alter table public.domain_orders add constraint domain_orders_status_check check (status in (
  'pending_payment','payment_verified','registration_pending','registration_reconciliation_required',
  'active','registration_failed','manual_refund_required','failed','cancelled'
));

alter table public.domain_transfers drop constraint if exists domain_transfers_status_check;
alter table public.domain_transfers add constraint domain_transfers_status_check check (status in (
  'pending_payment','payment_verified','transfer_submitting','transfer_pending',
  'transfer_reconciliation_required','completed','failed','manual_refund_required','cancelled'
));

-- Open transfers now include transfer_reconciliation_required (registrar outcome unknown).
drop index if exists public.domain_transfers_open_uniq;
create unique index domain_transfers_open_uniq
  on public.domain_transfers (user_id, domain)
  where status in ('pending_payment','payment_verified','transfer_submitting','transfer_pending','transfer_reconciliation_required');

create index if not exists domain_orders_reconciliation_idx
  on public.domain_orders (status, updated_at)
  where status = 'registration_reconciliation_required';

create index if not exists domain_transfers_reconciliation_idx
  on public.domain_transfers (status, updated_at)
  where status = 'transfer_reconciliation_required';

commit;

-- Read-only verification after applying:
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conname in ('domain_orders_status_check','domain_transfers_status_check');
-- select indexdef from pg_indexes where indexname = 'domain_transfers_open_uniq';
-- select status, count(*) from public.domain_orders group by status order by status;
-- select status, count(*) from public.domain_transfers group by status order by status;

-- Post-migration (not part of this file): set CRON_SECRET in Vercel and add a crons entry
-- for /api/cron/domain-reconciliation (see report for supported frequency).

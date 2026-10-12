-- 30-day grace period for store-owner-initiated customer deletion.
--
-- An owner "delete" now SUSPENDS the account: deletion_scheduled_at is set 30
-- days ahead and the owner can restore it until then. A daily cron wipes the
-- personal data once the date passes (the same anonymization the customer's own
-- instant "delete my account" uses). Requires 042. Idempotent, one transaction.
-- NOT applied automatically: review, then run once.
--
-- Suspended account: deletion_scheduled_at IS NOT NULL and anonymized_at IS NULL.

begin;

alter table public.store_customers
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_at timestamptz,
  add column if not exists deletion_requested_by text;

-- Serves the daily sweep and the owner's "pending deletion" tab.
create index if not exists store_customers_pending_deletion_idx
  on public.store_customers (deletion_scheduled_at)
  where deletion_scheduled_at is not null and anonymized_at is null;

-- Allow the new audit events. Events carry ids only, never personal data.
alter table public.store_customer_events
  drop constraint if exists store_customer_events_event_check;
alter table public.store_customer_events
  add constraint store_customer_events_event_check check (event in (
    'deleted_by_customer',
    'anonymized_by_owner',
    'exported_by_owner',
    'suspended_by_owner',
    'restored_by_owner',
    'finalized_after_grace',
    'purged_early_by_owner',
    'deletion_postponed'
  ));

-- The return type changes (deletion_scheduled_at), so the old function is dropped.
-- p_status defaults to 'active', so callers that still send the old five
-- arguments keep working. Both lists exclude anonymized rows (deleted_at set).
drop function if exists public.store_owner_customers(uuid, text, text, integer, integer);
drop function if exists public.store_owner_customers(uuid, text, text, integer, integer, text);

create function public.store_owner_customers(
  p_project_id uuid,
  p_search text,
  p_sort text,
  p_limit integer,
  p_offset integer,
  p_status text default 'active'
)
returns table (
  id uuid,
  email text,
  name text,
  phone text,
  city text,
  created_at timestamptz,
  order_count bigint,
  total_spent_cents bigint,
  last_order_at timestamptz,
  deletion_scheduled_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with agg as (
    select
      o.customer_id,
      count(*) filter (where o.status <> 'failed') as order_count,
      coalesce(
        sum(o.total_cents) filter (
          where o.payment_status = 'paid'
            and o.status not in ('cancelled', 'refunded', 'failed')
        ),
        0
      )::bigint as total_spent_cents,
      max(o.created_at) filter (where o.status <> 'failed') as last_order_at
    from public.ecommerce_orders o
    where o.project_id = p_project_id and o.customer_id is not null
    group by o.customer_id
  ),
  filtered as (
    select
      c.id::uuid as id,
      c.email::text as email,
      coalesce(c.name, '')::text as name,
      coalesce(c.phone, '')::text as phone,
      coalesce(c.city, '')::text as city,
      c.created_at,
      coalesce(a.order_count, 0)::bigint as order_count,
      coalesce(a.total_spent_cents, 0)::bigint as total_spent_cents,
      a.last_order_at,
      c.deletion_scheduled_at
    from public.store_customers c
    left join agg a on a.customer_id = c.id
    where c.project_id = p_project_id
      and c.deleted_at is null
      and (
        case
          when p_status = 'pending_deletion'
            then c.deletion_scheduled_at is not null and c.anonymized_at is null
          else c.deletion_scheduled_at is null
        end
      )
      and (
        p_search is null
        or length(p_search) < 2
        or c.email ilike '%' || p_search || '%' escape '\'
        or c.name ilike '%' || p_search || '%' escape '\'
        or c.phone ilike '%' || p_search || '%' escape '\'
      )
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by
    (case when p_status = 'pending_deletion' then f.deletion_scheduled_at end) asc nulls last,
    (case when p_sort = 'spent' then f.total_spent_cents end) desc nulls last,
    (case when p_sort = 'last_order' then f.last_order_at end) desc nulls last,
    f.created_at desc,
    f.id
  limit greatest(least(coalesce(p_limit, 25), 5000), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.store_owner_customers(uuid, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.store_owner_customers(uuid, text, text, integer, integer, text) to service_role;

commit;

-- Verify:
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'store_customers' and column_name like 'deletion_%';
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'store_customer_events_event_check';
-- select grantee, privilege_type from information_schema.routine_privileges
--   where routine_schema = 'public' and routine_name = 'store_owner_customers';  -- service_role only

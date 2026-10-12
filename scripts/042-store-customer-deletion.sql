-- Store customer account deletion (KVKK/GDPR) + owner customer directory.
--
-- Deleting a customer ANONYMIZES the row instead of removing it: orders keep
-- pointing at it (accounting/shipping need them), but every personal field is
-- wiped. Idempotent: safe to run more than once.

alter table public.store_customers
  add column if not exists deleted_at timestamptz,
  add column if not exists anonymized_at timestamptz;

create index if not exists store_customers_project_created_idx
  on public.store_customers (project_id, created_at desc)
  where deleted_at is null;

create index if not exists ecommerce_orders_project_customer_idx
  on public.ecommerce_orders (project_id, customer_id)
  where customer_id is not null;

-- Audit trail. Holds ids only, never personal data. customer_id is not a
-- foreign key so the trail survives even a hard delete, and is NULL for
-- project-wide events such as a CSV export.
create table if not exists public.store_customer_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  customer_id uuid,
  event text not null check (event in ('deleted_by_customer', 'anonymized_by_owner', 'exported_by_owner')),
  actor_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists store_customer_events_project_idx
  on public.store_customer_events (project_id, created_at desc);

alter table public.store_customer_events enable row level security;
-- No policies: deny-by-default, only the service role reads/writes.

-- Owner directory: one row per live customer with order aggregates, filtered,
-- sorted and paginated in SQL. `total_count` is the full match count.
-- p_search must already have `\`, `%` and `_` escaped by the caller.
-- Spend counts only paid orders that were not cancelled/refunded/failed.
create or replace function public.store_owner_customers(
  p_project_id uuid,
  p_search text,
  p_sort text,
  p_limit integer,
  p_offset integer
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
      a.last_order_at
    from public.store_customers c
    left join agg a on a.customer_id = c.id
    where c.project_id = p_project_id
      and c.deleted_at is null
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
    (case when p_sort = 'spent' then f.total_spent_cents end) desc nulls last,
    (case when p_sort = 'last_order' then f.last_order_at end) desc nulls last,
    f.created_at desc,
    f.id
  limit greatest(least(coalesce(p_limit, 25), 5000), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.store_owner_customers(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.store_owner_customers(uuid, text, text, integer, integer) to service_role;

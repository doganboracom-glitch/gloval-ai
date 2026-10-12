-- 046: get_store_collections computes best sellers only when needed.
--
-- 045 aggregated 90 days of paid order items on EVERY public storefront read,
-- even for stores with no auto best-sellers collection. The "sales" and "best"
-- CTEs now run only when the project has a collection with
-- auto_best_sellers = true; otherwise the uncorrelated `has_auto` flag turns
-- them into a one-time-filter no-op.
--
-- Same signature and return type as 045, so CREATE OR REPLACE keeps the
-- existing grants; they are restated below for clarity. Idempotent.

begin;

create index if not exists ecommerce_orders_project_paid_created_idx
  on public.ecommerce_orders (project_id, created_at)
  where payment_status = 'paid';

create index if not exists ecommerce_order_items_order_product_idx
  on public.ecommerce_order_items (order_id, product_id);

create or replace function public.get_store_collections(p_slug text)
returns table (
  id uuid, name text, slug text, sort_order integer, auto_best_sellers boolean,
  product_ids uuid[]
)
language sql stable security definer set search_path = public
as $$
  with proj as (
    select pr.id from projects pr where pr.slug = p_slug and pr.published = true
  ),
  has_auto as (
    select exists (
      select 1
      from ecommerce_collections c
      join proj on proj.id = c.project_id
      where c.auto_best_sellers
    ) as v
  ),
  sales as (
    select oi.product_id, sum(oi.quantity)::bigint as qty
    from ecommerce_order_items oi
    join ecommerce_orders o on o.id = oi.order_id
    join proj on proj.id = o.project_id
    where (select v from has_auto)
      and o.payment_status = 'paid'
      and o.status not in ('cancelled', 'failed', 'refunded')
      and o.created_at >= now() - interval '90 days'
      and oi.product_id is not null
    group by oi.product_id
  ),
  best as (
    select array_agg(t.product_id order by t.qty desc, t.created_at desc) as ids
    from (
      select s.product_id, s.qty, p.created_at
      from sales s
      join ecommerce_products p on p.id = s.product_id and p.status = 'active'
      join proj on proj.id = p.project_id
      order by s.qty desc, p.created_at desc
      limit 8
    ) t
  )
  select x.id, x.name, x.slug, x.sort_order, x.auto_best_sellers, x.product_ids
  from (
    select c.id, c.name, c.slug, c.sort_order, c.auto_best_sellers, c.created_at,
      case
        when c.auto_best_sellers and (select ids from best) is not null
          then (select ids from best)
        else coalesce(m.ids, '{}'::uuid[])
      end as product_ids
    from ecommerce_collections c
    join proj on proj.id = c.project_id
    left join lateral (
      select array_agg(pc.product_id order by p.sort_order, p.created_at desc) as ids
      from ecommerce_product_collections pc
      join ecommerce_products p on p.id = pc.product_id and p.status = 'active'
      where pc.collection_id = c.id
    ) m on true
  ) x
  where cardinality(x.product_ids) > 0
  order by x.sort_order, x.created_at;
$$;

revoke all on function public.get_store_collections(text) from public;
grant execute on function public.get_store_collections(text) to anon, authenticated, service_role;

commit;

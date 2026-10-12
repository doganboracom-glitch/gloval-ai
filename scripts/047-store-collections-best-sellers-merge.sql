-- 047: an auto best-sellers collection no longer discards its manual members.
--
-- 046 returned ONLY the paid-order best sellers whenever an
-- auto_best_sellers collection had any sales, ignoring every product the owner
-- added by hand. A store with one sold product and two hand-picked members
-- therefore showed 1 product live while the editor preview (manual members)
-- showed 2. Now the collection is: best sellers first (sales order), then the
-- manual members that are not already listed (owner order), capped at 12 (the
-- largest showcase limit). With no sales the result is the manual members, as
-- before.
--
-- Same signature and return type as 046, so CREATE OR REPLACE keeps the
-- existing grants; they are restated below. Idempotent.

begin;

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
        when c.auto_best_sellers then (
          select array_agg(d.product_id order by d.ord)
          from (
            select q.product_id, q.ord
            from (
              select distinct on (z.product_id) z.product_id, z.ord
              from (
                select b.product_id, b.ord
                from unnest(coalesce((select ids from best), '{}'::uuid[]))
                  with ordinality as b(product_id, ord)
                union all
                select mm.product_id, 1000 + mm.ord
                from unnest(coalesce(m.ids, '{}'::uuid[]))
                  with ordinality as mm(product_id, ord)
              ) z
              order by z.product_id, z.ord
            ) q
            order by q.ord
            limit 12
          ) d
        )
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

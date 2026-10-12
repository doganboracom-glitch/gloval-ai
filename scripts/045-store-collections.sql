-- Store-owner collections for the storefront catalog.
-- Idempotent. Review and apply manually; the app degrades to "no collections"
-- until this has been applied.
begin;

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------
create table if not exists public.ecommerce_collections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  slug text not null,
  sort_order integer not null default 0,
  auto_best_sellers boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, slug)
);

-- Target of the composite foreign key below: a membership row can only point at
-- a collection that belongs to the SAME project as the row itself.
do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ecommerce_collections_id_project_key'
       and conrelid = 'public.ecommerce_collections'::regclass
  ) then
    alter table public.ecommerce_collections
      add constraint ecommerce_collections_id_project_key unique (id, project_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'ecommerce_collections_slug_format_check'
       and conrelid = 'public.ecommerce_collections'::regclass
  ) then
    alter table public.ecommerce_collections
      add constraint ecommerce_collections_slug_format_check
      check (slug <> '' and slug ~ '^[a-z0-9-]{1,60}$');
  end if;
end $$;

-- Same reasoning for products.
do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ecommerce_products_id_project_key'
       and conrelid = 'public.ecommerce_products'::regclass
  ) then
    alter table public.ecommerce_products
      add constraint ecommerce_products_id_project_key unique (id, project_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Membership (product <-> collection), project-consistent by construction
-- ---------------------------------------------------------------------------
create table if not exists public.ecommerce_product_collections (
  collection_id uuid not null,
  product_id uuid not null,
  project_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (collection_id, product_id),
  constraint ecommerce_product_collections_collection_fk
    foreign key (collection_id, project_id)
    references public.ecommerce_collections (id, project_id) on delete cascade,
  constraint ecommerce_product_collections_product_fk
    foreign key (product_id, project_id)
    references public.ecommerce_products (id, project_id) on delete cascade
);

create index if not exists ecommerce_product_collections_product_idx
  on public.ecommerce_product_collections (product_id);
create index if not exists ecommerce_product_collections_project_idx
  on public.ecommerce_product_collections (project_id);

-- At most 12 collections per store, enforced where it cannot be bypassed.
create or replace function public.ecommerce_collections_limit()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text, 45));
  if (select count(*) from public.ecommerce_collections where project_id = new.project_id) >= 12 then
    raise exception 'collection_limit_reached' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists ecommerce_collections_limit_trg on public.ecommerce_collections;
create trigger ecommerce_collections_limit_trg
  before insert on public.ecommerce_collections
  for each row execute function public.ecommerce_collections_limit();

-- Owners reach these tables only through server actions (service role) after an
-- ownership check; the public storefront reads through the RPC below.
alter table public.ecommerce_collections enable row level security;
alter table public.ecommerce_product_collections enable row level security;
revoke all on public.ecommerce_collections from public, anon, authenticated;
revoke all on public.ecommerce_product_collections from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public read: collections of a PUBLISHED store, with active products only.
--  * Manual collections list their members in the owner's product order.
--  * auto_best_sellers collections list the store's top 8 products by units
--    sold in the last 90 days. Only PAID orders count; pending, failed,
--    cancelled and refunded orders are ignored. With no such sales the
--    collection falls back to its manually selected products.
--  * Collections with no visible product are omitted.
-- ---------------------------------------------------------------------------
drop function if exists public.get_store_collections(text);
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
  sales as (
    select oi.product_id, sum(oi.quantity)::bigint as qty
    from ecommerce_order_items oi
    join ecommerce_orders o on o.id = oi.order_id
    join proj on proj.id = o.project_id
    where o.payment_status = 'paid'
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

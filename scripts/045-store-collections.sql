-- Store-owner collections for the storefront catalog.
-- Idempotent, review and apply manually.
begin;

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

create table if not exists public.ecommerce_product_collections (
  collection_id uuid not null references public.ecommerce_collections(id) on delete cascade,
  product_id uuid not null references public.ecommerce_products(id) on delete cascade,
  primary key (collection_id, product_id)
);

alter table public.ecommerce_collections enable row level security;
alter table public.ecommerce_product_collections enable row level security;
revoke all on public.ecommerce_collections from public, anon, authenticated;
revoke all on public.ecommerce_product_collections from public, anon, authenticated;

drop function if exists public.get_store_collections(text);
create or replace function public.get_store_collections(p_slug text)
returns table (
  id uuid, name text, slug text, sort_order integer, auto_best_sellers boolean,
  product_ids uuid[]
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, c.slug, c.sort_order, c.auto_best_sellers,
    coalesce(array_agg(pc.product_id order by p.sort_order, p.created_at desc)
      filter (where p.id is not null), '{}'::uuid[]) as product_ids
  from ecommerce_collections c
  join projects pr on pr.id = c.project_id and pr.slug = p_slug and pr.published = true
  left join ecommerce_product_collections pc on pc.collection_id = c.id
  left join ecommerce_products p on p.id = pc.product_id and p.status = 'active'
  group by c.id
  having count(p.id) > 0
  order by c.sort_order, c.created_at;
$$;

grant execute on function public.get_store_collections(text) to anon, authenticated;
commit;

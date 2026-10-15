-- 063: projects.commerce_mode + ecommerce_products.price_mode
--
-- commerce_mode decides what a site's storefront IS:
--   'ecommerce' : full store (cart, checkout, orders, customers, payments)
--   'catalog'   : PRO-only product showcase, orders arrive over WhatsApp
--   'none'      : no store (corporate site)
--
-- Backwards compatible and idempotent: safe to run more than once. Existing
-- e-commerce projects become 'ecommerce', every other project becomes 'none',
-- so no existing site changes behaviour. The app tolerates this migration not
-- being applied yet (it falls back to project_type).

alter table public.projects
  add column if not exists commerce_mode text;

-- Backfill only rows that have no value yet (re-running never overwrites 'catalog').
update public.projects
set commerce_mode = case when project_type = 'ecommerce' then 'ecommerce' else 'none' end
where commerce_mode is null;

alter table public.projects
  alter column commerce_mode set default 'none';

alter table public.projects
  alter column commerce_mode set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_commerce_mode_check'
  ) then
    alter table public.projects
      add constraint projects_commerce_mode_check
      check (commerce_mode in ('ecommerce', 'catalog', 'none'));
  end if;
end $$;

-- Per-product price display: 'show' prints the price, 'ask' prints "Fiyat için sor".
alter table public.ecommerce_products
  add column if not exists price_mode text not null default 'show';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ecommerce_products_price_mode_check'
  ) then
    alter table public.ecommerce_products
      add constraint ecommerce_products_price_mode_check
      check (price_mode in ('show', 'ask'));
  end if;
end $$;

create index if not exists projects_commerce_mode_idx
  on public.projects (owner_id, commerce_mode);

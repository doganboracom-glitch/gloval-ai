-- 033: One-time cleanup of the legacy placeholder stock (999).
-- Synced products used to be created with a made-up stock of 999. Those rows
-- are switched to "stock not tracked" so the storefront stops showing a
-- fake quantity. Requires 032 (track_stock column).
-- NOT applied automatically — review, then run once. Reversible (see bottom).
--
-- Scope is deliberately narrow: only rows that still look like the untouched
-- placeholder (stock = 999, currently tracked, never reserved by an order).

begin;

-- Backup of exactly what is changed, so the change can be undone precisely.
create table if not exists public.ecommerce_products_untrack_999_backup (
  product_id uuid primary key,
  previous_stock int not null,
  previous_track_stock boolean not null,
  changed_at timestamptz not null default now()
);

alter table public.ecommerce_products_untrack_999_backup enable row level security;
revoke all on public.ecommerce_products_untrack_999_backup from anon, authenticated;

insert into public.ecommerce_products_untrack_999_backup (product_id, previous_stock, previous_track_stock)
select p.id, p.stock, p.track_stock
  from public.ecommerce_products p
 where p.stock = 999
   and p.track_stock = true
   and not exists (
     select 1
       from public.ecommerce_order_items oi
      where oi.product_id = p.id
   )
on conflict (product_id) do nothing;

update public.ecommerce_products p
   set track_stock = false
  from public.ecommerce_products_untrack_999_backup b
 where b.product_id = p.id
   and p.stock = b.previous_stock
   and p.track_stock = true;

commit;

-- ROLLBACK (run manually if needed):
--
-- begin;
-- update public.ecommerce_products p
--    set track_stock = b.previous_track_stock,
--        stock = b.previous_stock
--   from public.ecommerce_products_untrack_999_backup b
--  where b.product_id = p.id;
-- drop table public.ecommerce_products_untrack_999_backup;
-- commit;

-- 032: Store order integrity (stock, price, sync lifecycle).
-- Idempotent and backwards compatible: the app keeps working before this runs
-- (it detects the missing columns/functions and falls back to legacy behavior).
-- NOT applied automatically — review, then run once.

begin;

-- 1. Product columns ---------------------------------------------------------
alter table public.ecommerce_products
  add column if not exists source text not null default 'manual',
  add column if not exists track_stock boolean not null default true,
  add column if not exists sync_archived_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ecommerce_products_source_check') then
    alter table public.ecommerce_products
      add constraint ecommerce_products_source_check check (source in ('manual', 'sync'));
  end if;

  -- A product can no longer be sold for 0 (or less). NOT VALID enforces it for
  -- every new/updated row immediately; there are 0 zero-price rows today, so it
  -- is safe to also run the VALIDATE statement below.
  if not exists (select 1 from pg_constraint where conname = 'ecommerce_products_price_positive') then
    alter table public.ecommerce_products
      add constraint ecommerce_products_price_positive check (price_cents > 0) not valid;
  end if;
end $$;

-- alter table public.ecommerce_products validate constraint ecommerce_products_price_positive;

-- 2. Order column: has this order's stock been taken? ------------------------
alter table public.ecommerce_orders
  add column if not exists stock_reserved boolean not null default false;

-- 3. Atomic stock functions (service role only) ------------------------------

-- Decrements one product atomically. Returns the new stock, or NULL when the
-- product is missing or has too little stock. Untracked products never change.
create or replace function public.decrement_product_stock(p_product_id uuid, p_qty int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock int;
begin
  if p_qty is null or p_qty < 1 then
    raise exception 'invalid_quantity';
  end if;

  update public.ecommerce_products
     set stock = case when track_stock then stock - p_qty else stock end
   where id = p_product_id
     and (track_stock = false or stock >= p_qty)
  returning stock into v_stock;

  if not found then
    return null;
  end if;
  return v_stock;
end;
$$;

-- Takes the stock of ALL items of an order in one transaction. Either every
-- product is decremented or none is. Idempotent via ecommerce_orders.stock_reserved.
create or replace function public.reserve_order_stock(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved boolean;
  r record;
begin
  select stock_reserved into v_reserved
    from public.ecommerce_orders
   where id = p_order_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;
  if v_reserved then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  begin
    -- Fixed product order prevents deadlocks between concurrent orders.
    for r in
      select product_id, sum(quantity)::int as qty
        from public.ecommerce_order_items
       where order_id = p_order_id and product_id is not null
       group by product_id
       order by product_id
    loop
      if public.decrement_product_stock(r.product_id, r.qty) is null then
        raise exception 'insufficient_stock:%', r.product_id using errcode = 'P0001';
      end if;
    end loop;
  exception when sqlstate 'P0001' then
    -- The sub-transaction is rolled back, undoing any partial decrement.
    return jsonb_build_object(
      'ok', false,
      'error', 'insufficient_stock',
      'product_id', substring(sqlerrm from 'insufficient_stock:(.*)$')
    );
  end;

  update public.ecommerce_orders set stock_reserved = true where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Gives an order's stock back. Idempotent. With p_only_unpaid the payment status
-- is re-checked under the row lock so a concurrent "paid" never loses its stock.
create or replace function public.release_order_stock(p_order_id uuid, p_only_unpaid boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved boolean;
  v_payment text;
  r record;
begin
  select stock_reserved, payment_status into v_reserved, v_payment
    from public.ecommerce_orders
   where id = p_order_id
   for update;

  if not found or not v_reserved then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if p_only_unpaid and v_payment in ('paid', 'refunded') then
    return jsonb_build_object('ok', true, 'skipped', 'paid');
  end if;

  for r in
    select product_id, sum(quantity)::int as qty
      from public.ecommerce_order_items
     where order_id = p_order_id and product_id is not null
     group by product_id
     order by product_id
  loop
    update public.ecommerce_products
       set stock = stock + r.qty
     where id = r.product_id and track_stock;
  end loop;

  update public.ecommerce_orders set stock_reserved = false where id = p_order_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Cancels abandoned, unpaid online-payment orders and returns their stock.
-- Bank-transfer orders (awaiting a human) are never touched.
create or replace function public.release_stale_order_stock(
  p_project_id uuid default null,
  p_max_age interval default interval '2 hours'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select id
      from public.ecommerce_orders
     where stock_reserved
       and status = 'pending'
       and payment_status = 'pending'
       and payment_provider <> 'bank_transfer'
       and created_at < now() - p_max_age
       and (p_project_id is null or project_id = p_project_id)
     order by created_at
     limit 200
  loop
    perform public.release_order_stock(r.id, true);
    update public.ecommerce_orders
       set status = 'cancelled'
     where id = r.id and status = 'pending' and payment_status = 'pending';
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.decrement_product_stock(uuid, int) from public, anon, authenticated;
revoke all on function public.reserve_order_stock(uuid) from public, anon, authenticated;
revoke all on function public.release_order_stock(uuid, boolean) from public, anon, authenticated;
revoke all on function public.release_stale_order_stock(uuid, interval) from public, anon, authenticated;
grant execute on function public.decrement_product_stock(uuid, int) to service_role;
grant execute on function public.reserve_order_stock(uuid) to service_role;
grant execute on function public.release_order_stock(uuid, boolean) to service_role;
grant execute on function public.release_stale_order_stock(uuid, interval) to service_role;

-- 4. Public catalog RPC now also exposes track_stock -------------------------
-- (return type changes, so the function must be dropped and recreated)
drop function if exists public.get_store_products(text);

create function public.get_store_products(p_slug text)
returns table (
  id uuid,
  category_id uuid,
  name text,
  slug text,
  description text,
  price_cents int,
  currency text,
  stock int,
  images jsonb,
  track_stock boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.category_id, p.name, p.slug, p.description, p.price_cents,
         p.currency, p.stock, to_jsonb(p.images), p.track_stock
    from public.ecommerce_products p
    join public.projects pr on pr.id = p.project_id
   where pr.slug = p_slug
     and pr.status = 'published'
     and p.status = 'active'
   order by p.sort_order, p.created_at;
$$;

grant execute on function public.get_store_products(text) to anon, authenticated, service_role;

commit;

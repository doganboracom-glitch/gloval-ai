-- 035: release_stale_order_stock must not touch cash-on-delivery orders.
--
-- The 032 version only exempted `bank_transfer`, so a pending
-- `cash_on_delivery` order (waiting for the store owner, no timeout) would be
-- cancelled after two hours if this function were ever called. Manual methods
-- (bank transfer, cash on delivery) are now both excluded; only abandoned,
-- unpaid ONLINE-payment orders older than p_max_age are cancelled.
--
-- Body is identical to 032 except for the payment_provider condition.
-- Idempotent: create or replace + re-stated privileges; safe to run repeatedly.

-- Cancels abandoned, unpaid online-payment orders and returns their stock.
-- Manual-payment orders (bank transfer, cash on delivery) wait for a human
-- and are never touched.
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
       and payment_provider not in ('bank_transfer', 'cash_on_delivery')
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

-- Privileges unchanged from 032: service_role only.
revoke all on function public.release_stale_order_stock(uuid, interval) from public, anon, authenticated;
grant execute on function public.release_stale_order_stock(uuid, interval) to service_role;

-- At most one OPEN purchase (pending or paid-but-not-yet-granted) per user,
-- subscription and add-on. This is the atomic guard behind the double-click
-- protection in `purchaseAddOn`: a second concurrent attempt hits 23505 instead
-- of opening a second payment. Once a purchase is `granted`, `failed` or
-- `manual_refund_required` it leaves the index, so buying the same add-on again
-- later (for more capacity) is allowed.
create unique index if not exists addon_purchases_one_open_idx
  on public.addon_purchases (user_id, subscription_id, addon_code)
  where status in ('pending', 'paid');

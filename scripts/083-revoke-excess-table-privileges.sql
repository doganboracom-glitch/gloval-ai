-- 083: remove excess table privileges from anon/authenticated on public.
-- All server-side writes go through service_role; user-session writes are
-- limited to tables that have a matching RLS write policy.
begin;

-- 1+2) anon: all write/DDL-like privileges; authenticated: TRUNCATE/REFERENCES/TRIGGER
do $$
declare t text;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from anon', t);
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', t);
  end loop;
end $$;

-- 3a) Tables with no write policy: remove authenticated INSERT/UPDATE/DELETE
revoke insert, update, delete on table
  public.admin_package_audit,
  public.ai_credit_transactions,
  public.billing_entitlements,
  public.billing_plans,
  public.billing_subscriptions,
  public.billing_transactions,
  public.domain_orders,
  public.domain_renewals,
  public.domain_transfers,
  public.ecommerce_order_items,
  public.free_daily_usage,
  public.notification_logs,
  public.project_entitlements,
  public.store_customers,
  public.support_ticket_attachments,
  public.user_addon_entitlements,
  public.user_limit_overrides
from authenticated;

-- 3b) Partial policies: remove commands without a matching policy
revoke insert, delete on table public.ecommerce_orders from authenticated;        -- UPDATE policy only
revoke update on table public.project_versions from authenticated;                -- INSERT/DELETE policies
revoke update, delete on table public.support_tickets, public.support_ticket_messages from authenticated; -- INSERT policy only

commit;

-- Rollback for 083: restores the post-082 grant snapshot.
begin;

grant insert, update, delete, truncate, references, trigger on table
  public.admin_package_audit, public.ai_credit_transactions, public.billing_entitlements,
  public.billing_plans, public.billing_subscriptions, public.billing_transactions,
  public.domain_orders, public.domain_renewals, public.domain_transfers,
  public.ecommerce_categories, public.ecommerce_order_items, public.ecommerce_orders,
  public.ecommerce_payment_settings, public.ecommerce_product_variants, public.ecommerce_products,
  public.free_daily_usage, public.notification_logs, public.profiles,
  public.project_entitlements, public.project_versions, public.projects,
  public.store_customers, public.support_ticket_attachments, public.support_ticket_messages,
  public.support_tickets, public.user_addon_entitlements, public.user_limit_overrides
to anon, authenticated;

grant references, trigger on table public.custom_domains to anon, authenticated;

commit;

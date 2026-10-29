-- Rollback for 082: restores the previous (over-permissive) EXECUTE grants.
grant execute on function public.consume_ai_credits(uuid, integer, text),
  public.refund_ai_credits(uuid, integer, text),
  public.check_and_increment_free_daily_action(uuid, integer),
  public.grant_signup_credits(),
  public.handle_new_user(),
  public.addon_purchases_touch_updated_at(),
  public.admin_overdue_audit_immutable(),
  public.admin_package_audit_immutable(),
  public.custom_domains_touch_updated_at(),
  public.ecommerce_collections_limit(),
  public.platform_blog_posts_touch_updated_at(),
  public.prevent_billing_profile_reveal_audit_mutation(),
  public.site_blog_posts_touch_updated_at(),
  public.touch_ecommerce_products_updated_at()
to anon, authenticated;

alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated;

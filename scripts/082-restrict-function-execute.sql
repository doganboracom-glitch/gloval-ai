-- 082: restrict EXECUTE on public-schema functions.
--
-- Audit (gloval-production): consume_ai_credits, refund_ai_credits and
-- check_and_increment_free_daily_action are SECURITY DEFINER, take a
-- caller-supplied p_user_id, have no auth.uid()/role check, and were EXECUTABLE
-- BY anon/authenticated (refund_ai_credits lets any caller mint credits for any
-- user). Every call site in the repo uses createAdminClient() (service_role).
--
-- Intentionally still public (anon storefront / published sites):
--   get_published_site, get_store_collections, get_store_products, site_branding_removed

-- 1) SECURITY DEFINER, caller-supplied identity: service_role only.
revoke all on function public.consume_ai_credits(uuid, integer, text)              from public, anon, authenticated;
revoke all on function public.refund_ai_credits(uuid, integer, text)               from public, anon, authenticated;
revoke all on function public.check_and_increment_free_daily_action(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_credits(uuid, integer, text)              to service_role;
grant execute on function public.refund_ai_credits(uuid, integer, text)               to service_role;
grant execute on function public.check_and_increment_free_daily_action(uuid, integer) to service_role;

-- 2) Trigger functions: EXECUTE is checked at CREATE TRIGGER, never when the trigger fires,
--    so revoking does not affect existing triggers.
revoke all on function public.grant_signup_credits()                        from public, anon, authenticated;
revoke all on function public.handle_new_user()                             from public, anon, authenticated;
revoke all on function public.addon_purchases_touch_updated_at()            from public, anon, authenticated;
revoke all on function public.admin_overdue_audit_immutable()               from public, anon, authenticated;
revoke all on function public.admin_package_audit_immutable()               from public, anon, authenticated;
revoke all on function public.custom_domains_touch_updated_at()             from public, anon, authenticated;
revoke all on function public.ecommerce_collections_limit()                 from public, anon, authenticated;
revoke all on function public.platform_blog_posts_touch_updated_at()        from public, anon, authenticated;
revoke all on function public.prevent_billing_profile_reveal_audit_mutation() from public, anon, authenticated;
revoke all on function public.site_blog_posts_touch_updated_at()            from public, anon, authenticated;
revoke all on function public.touch_ecommerce_products_updated_at()         from public, anon, authenticated;

-- 3) Public RPCs: make the intent explicit (no behaviour change).
grant execute on function public.get_published_site(text)     to anon, authenticated, service_role;
grant execute on function public.get_store_collections(text)  to anon, authenticated, service_role;
grant execute on function public.get_store_products(text)     to anon, authenticated, service_role;
grant execute on function public.site_branding_removed(text)  to anon, authenticated, service_role;

-- 4) New functions created by postgres in public are no longer callable by clients by default.
--    A future public RPC needs an explicit GRANT EXECUTE ... TO anon/authenticated.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

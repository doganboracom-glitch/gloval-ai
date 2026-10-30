-- authenticated: SELECT only (RLS limits rows to the owner).
-- ads_usage_events is intentionally NOT granted: model, token and cost data
-- must not be visible to users.
grant select on table
  public.ads_brands,
  public.ads_plans,
  public.ads_actions,
  public.ads_recommendations
to authenticated;

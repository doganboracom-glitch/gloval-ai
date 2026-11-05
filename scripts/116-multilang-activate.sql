-- UNAPPLIED: review and run manually; this script has not been applied to any database.
-- Activates only the existing multilang catalog row. Price and interval are unchanged.
UPDATE public.billing_plans
SET active = true
WHERE code = 'multilang'
  AND active IS DISTINCT FROM true;

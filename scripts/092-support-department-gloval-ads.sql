-- support_department_gloval_ads_092
-- applied as supabase migration 20261031123813_ads_google_readonly_oauth_quota; file numbered 092 because 091 is ads-google-readonly
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.support_tickets
  DROP CONSTRAINT support_tickets_department_check,
  ADD CONSTRAINT support_tickets_department_check
  CHECK (department = ANY (ARRAY['technical'::text,'billing'::text,'domain'::text,'website'::text,'ai'::text,'gloval-ads'::text,'account'::text,'other'::text]));
COMMIT;

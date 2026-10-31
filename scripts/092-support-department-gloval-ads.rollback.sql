-- Rollback for support_department_gloval_ads_092
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $rollback$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.support_tickets
    WHERE department = 'gloval-ads'
  ) THEN
    RAISE EXCEPTION 'Cannot roll back support_department_gloval_ads_092 while support_tickets rows use gloval-ads';
  END IF;
END;
$rollback$;
ALTER TABLE public.support_tickets
  DROP CONSTRAINT support_tickets_department_check,
  ADD CONSTRAINT support_tickets_department_check
  CHECK (department = ANY (ARRAY['technical'::text,'billing'::text,'domain'::text,'website'::text,'ai'::text,'account'::text,'other'::text]));
COMMIT;

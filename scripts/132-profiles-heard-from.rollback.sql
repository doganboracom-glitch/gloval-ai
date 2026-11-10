-- STATUS: NOT APPLIED / UYGULANMADI. Use only to undo 132-profiles-heard-from.sql.
-- Drops the heard_from column (and with it the stored answers, its CHECK constraint
-- and its column grants). Nothing else on public.profiles is touched.
BEGIN;

REVOKE ALL PRIVILEGES (heard_from) ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_heard_from_check;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS heard_from;

COMMIT;

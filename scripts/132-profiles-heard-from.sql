-- STATUS: NOT APPLIED / UYGULANMADI. Draft only; no SQL was executed by this change.
-- Scope: ONE nullable column on public.profiles ("Bizi nereden duydun?") plus its
-- CHECK constraint and the column grants the signed-in owner needs.
-- No new table, no new policy, no trigger/function change, no existing grant changed.
--
-- Depends on 084-profiles-column-grants.sql: after 084 anon/PUBLIC have no table or
-- column privileges on public.profiles and the existing owner policies
-- (profiles_update_own USING/WITH CHECK auth.uid() = id, plus the owner SELECT policy)
-- already scope every client read/write to the caller's own row. This migration
-- deliberately does not touch those policies, so the answer is visible only to
-- the user themself (RLS) and to service_role (admin/server paths).
--
-- Access after applying:
--   anon / PUBLIC: nothing (explicit column revoke below; still relies on 084 for the table level).
--   authenticated: SELECT and UPDATE on heard_from only, own row only (existing RLS).
--   service_role: unchanged (all table privileges, covers the new column).
--
-- PRE-APPLY READ-ONLY CHECKS (run and inspect separately)
-- 1. 084 is applied: anon must have NO table-level privilege on public.profiles, otherwise
--    the new column would be readable through that grant.
-- SELECT grantee, privilege_type
-- FROM information_schema.table_privileges
-- WHERE table_schema = 'public' AND table_name = 'profiles'
--   AND lower(grantee) IN ('public', 'anon');
-- 2. Policies are the expected owner-scoped set:
-- SELECT policyname, roles, cmd, qual, with_check
-- FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' ORDER BY policyname;

-- START FORWARD MIGRATION
BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS heard_from text;

-- Fixed values only (no free text). NULL means "not answered".
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_heard_from_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_heard_from_check
  CHECK (heard_from IS NULL OR heard_from IN ('instagram', 'facebook', 'google', 'friend', 'press', 'other'));

REVOKE ALL PRIVILEGES (heard_from) ON TABLE public.profiles FROM PUBLIC, anon;
GRANT SELECT (heard_from) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (heard_from) ON TABLE public.profiles TO authenticated;

COMMIT;
-- END FORWARD MIGRATION

-- POST-APPLY READ-ONLY CHECKS (run separately after applying)
-- SELECT roles.role_name,
--        has_column_privilege(roles.role_name, 'public.profiles', 'heard_from', 'SELECT') AS can_select,
--        has_column_privilege(roles.role_name, 'public.profiles', 'heard_from', 'UPDATE') AS can_update
-- FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name);
-- Expected: anon false/false; authenticated true/true; service_role true/true.
--
-- ROLLBACK: scripts/132-profiles-heard-from.rollback.sql (drops the column and its data).

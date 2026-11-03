-- STATUS: NOT APPLIED / UYGULANMADI. Draft only; no SQL was executed by this change.
-- Based on the live catalog snapshot supplied for review.
-- Scope: public.profiles grants plus the existing profiles_update_own check only.
-- No other RLS policy or auth.users trigger is created, dropped, or changed.
--
-- Access after applying:
--   anon / PUBLIC: no table or column privileges.
--   authenticated: SELECT id, full_name, status; UPDATE full_name only.
--   service_role: all table privileges.
--
-- PRE-APPLY READ-ONLY CHECKS (run and inspect separately before the migration)
-- 1. Table-level grants:
-- SELECT grantee, privilege_type, is_grantable
-- FROM information_schema.table_privileges
-- WHERE table_schema = 'public' AND table_name = 'profiles'
--   AND lower(grantee) IN ('public', 'anon', 'authenticated', 'service_role')
-- ORDER BY grantee, privilege_type;
--
-- 2. Effective column privileges, including inherited PUBLIC grants:
-- SELECT roles.role_name, columns.column_name,
--        has_column_privilege(roles.role_name, 'public.profiles', columns.column_name, 'SELECT') AS can_select,
--        has_column_privilege(roles.role_name, 'public.profiles', columns.column_name, 'INSERT') AS can_insert,
--        has_column_privilege(roles.role_name, 'public.profiles', columns.column_name, 'UPDATE') AS can_update
-- FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name)
-- CROSS JOIN (VALUES ('id'), ('email'), ('full_name'), ('created_at'), ('status'),
--                    ('password_reset_blocked_until'), ('password_reset_security_version')) AS columns(column_name)
-- ORDER BY roles.role_name, columns.column_name;
--
-- 3. Preserve and verify the existing RLS policy set:
-- SELECT policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'profiles'
-- ORDER BY policyname;
--
-- 4. Verify the signup trigger on auth.users and inspect its function definition.
-- The repository's scripts/082 only revokes EXECUTE on handle_new_user(); no
-- CREATE FUNCTION / CREATE TRIGGER definition for profile creation is tracked in scripts/.
-- SELECT t.tgname, p.oid::regprocedure AS function_signature,
--        p.prosecdef AS security_definer, pg_get_triggerdef(t.oid) AS trigger_definition,
--        pg_get_functiondef(p.oid) AS function_definition
-- FROM pg_trigger AS t
-- JOIN pg_proc AS p ON p.oid = t.tgfoid
-- WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal
-- ORDER BY t.tgname;
-- Stop and investigate if the live auth.users trigger that creates profiles is absent.

-- START FORWARD MIGRATION
BEGIN;

-- Clear table-level and any prior column-level ACLs from client roles and PUBLIC.
-- Revoke the column ACLs explicitly so old column grants cannot survive the reset.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES (id, email, full_name, created_at, status,
  password_reset_blocked_until, password_reset_security_version)
ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

-- These are the only profile columns the authenticated app client reads/writes:
-- id is used for owner-scoped filters, full_name is editable, status is read by proxy.
GRANT SELECT (id, full_name, status) ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name) ON TABLE public.profiles TO authenticated;

-- Keep all server-side/admin paths working; service_role is never revoked above.
GRANT ALL PRIVILEGES ON TABLE public.profiles TO service_role;

-- Keep the owner predicate and add an explicit post-update owner check. ALTER
-- preserves the policy name, command, and existing target roles.
ALTER POLICY profiles_update_own ON public.profiles
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMIT;
-- END FORWARD MIGRATION

-- POST-APPLY READ-ONLY CHECKS (run separately after applying)
-- Repeat the table-level and column-level queries above. Expected:
--   anon: no effective table/column privileges;
--   authenticated: column SELECT only on id/full_name/status, column UPDATE only on full_name;
--   service_role: all table privileges.
-- Confirm the policy row still has roles={public}, cmd=UPDATE, qual=(auth.uid() = id),
-- and with_check=(auth.uid() = id); all other profiles policies must be unchanged.
--
-- MANUAL SMOKE TESTS (in a non-production/test environment)
-- 1. Create a new email/password user and a new Google OAuth user; verify the existing
--    auth.users trigger still creates each profiles row and preserves signup full_name.
-- 2. Sign in as a confirmed user; verify /settings and /billing can read full_name and
--    protected-route status checks continue to work.
-- 3. Update the signed-in user's own full_name successfully; a blank/other user's row
--    must not be writable. Updates to status, email, and password-reset columns must fail.
-- 4. As authenticated, profile INSERT and DELETE must fail; as anon, profile SELECT must fail.
-- 5. Exercise forgot-password cooldown and admin suspend/reactivate; server-side service-role
--    writes must continue to work, and suspended users must still be redirected.
-- 6. Delete a test account through the existing account-deletion flow; auth.admin deletion
--    and the profiles foreign-key cascade must still succeed without client DELETE privilege.
--
-- ROLLBACK SQL (manual only; run separately if restoring the pre-084 snapshot is approved).
-- The executable copy is scripts/084-profiles-column-grants.rollback.sql.
-- This deliberately restores the previously observed broader anon/authenticated grants.
-- BEGIN;
-- REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
-- REVOKE ALL PRIVILEGES (id, email, full_name, created_at, status,
--   password_reset_blocked_until, password_reset_security_version)
-- ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
-- GRANT SELECT ON TABLE public.profiles TO anon;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
-- GRANT ALL PRIVILEGES ON TABLE public.profiles TO service_role;
-- DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
-- CREATE POLICY profiles_update_own ON public.profiles
--   FOR UPDATE TO public USING (auth.uid() = id);
-- COMMIT;

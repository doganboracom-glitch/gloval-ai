-- STATUS: NOT APPLIED / UYGULANMADI. Use only after 084 was applied and rollback is approved.
-- Restores the previously verified ACL snapshot: anon SELECT and authenticated
-- SELECT/INSERT/UPDATE/DELETE. This intentionally reintroduces the old exposure.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES (id, email, full_name, created_at, status,
  password_reset_blocked_until, password_reset_security_version)
ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.profiles TO service_role;

-- Restore the original policy shape (USING only, which implicitly reuses the
-- predicate as the UPDATE check) without touching any other profile policy.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO public USING (auth.uid() = id);

COMMIT;

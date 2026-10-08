-- All writes to public.custom_domains run server-side through the service role,
-- which bypasses RLS and does not depend on these grants. Browser and
-- user-session roles only need to read their own rows through the existing
-- custom_domains_select_own policy, so strip every write privilege from them.
-- SELECT and the RLS policies are intentionally left untouched.
-- REVOKE is idempotent: re-running it on already-revoked privileges is a no-op.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.custom_domains FROM anon, authenticated;

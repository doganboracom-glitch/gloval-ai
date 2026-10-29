-- STATUS: NOT APPLIED / UYGULANMADI. Draft only; do not run until the owner approves.
--         (Verified read-only against the live database: authenticated still holds
--         table-level INSERT, UPDATE and DELETE on public.profiles.)
--
-- 084: authenticated may only update profiles.full_name (status and
-- password-reset columns are service_role only). SELECT is unchanged.
begin;

revoke insert, delete, update on table public.profiles from authenticated;
grant update (full_name) on table public.profiles to authenticated;

commit;

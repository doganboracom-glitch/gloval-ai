-- 084: authenticated may only update profiles.full_name (status and
-- password-reset columns are service_role only). SELECT is unchanged.
begin;

revoke insert, delete, update on table public.profiles from authenticated;
grant update (full_name) on table public.profiles to authenticated;

commit;

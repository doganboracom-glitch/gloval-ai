-- STATUS: NOT APPLIED / UYGULANMADI. Only relevant after 084 itself has been applied.
-- Rollback for 084.
begin;

revoke update (full_name) on table public.profiles from authenticated;
grant insert, update, delete on table public.profiles to authenticated;

commit;

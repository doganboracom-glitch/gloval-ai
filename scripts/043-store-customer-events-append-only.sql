-- Make the store customer audit trail append-only.
--
-- The application only ever INSERTs into store_customer_events (account deletion
-- and CSV export events) and reads it with SELECT. 042 granted select+insert but
-- did not revoke what the service role may already hold through Supabase default
-- privileges, so UPDATE/DELETE (and TRUNCATE) are revoked explicitly here.
-- Idempotent; nothing in the application depends on the removed privileges.
-- NOT applied automatically: review, then run once.

begin;

revoke update, delete, truncate on public.store_customer_events from service_role;
revoke all on public.store_customer_events from public, anon, authenticated;
grant select, insert on public.store_customer_events to service_role;

commit;

-- Verify (expect only INSERT and SELECT for service_role):
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'store_customer_events'
-- order by grantee, privilege_type;

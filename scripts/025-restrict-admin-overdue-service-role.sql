-- Already applied to the live database as migration `024b_admin_overdue_revoke_extra_service_role`.
-- This file only records it in the repository; do NOT apply it again by hand.
--
-- scripts/024-admin-overdue-payments.sql grants service_role select + insert on the
-- two admin overdue tables, but Supabase default privileges had already given the
-- role update, delete, truncate, references and trigger on newly created public
-- tables. Both tables are append-only (contact notes are never edited, the audit
-- log is protected by a trigger), so service_role keeps select + insert only.
--
-- Idempotent: REVOKE of a privilege that is not held is a no-op.

revoke update, delete, truncate, references, trigger
  on public.admin_overdue_contact_notes from service_role;

revoke update, delete, truncate, references, trigger
  on public.admin_overdue_audit from service_role;

grant select, insert on public.admin_overdue_contact_notes to service_role;
grant select, insert on public.admin_overdue_audit to service_role;

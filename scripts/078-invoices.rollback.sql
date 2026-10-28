-- Rollback for 078. Only safe BEFORE any invoice has been uploaded: dropping
-- invoices/invoice_audit destroys financial records and the audit trail.
-- Supabase blocks deleting a non-empty bucket via SQL; empty and remove the
-- bucket through the Storage API if objects exist.

begin;
set local lock_timeout = '5s';

drop table if exists public.invoice_audit;
drop function if exists public.block_invoice_audit_mutations();

drop table if exists public.invoices;
drop function if exists public.invoices_touch_updated_at();

drop index if exists public.billing_transactions_succeeded_created_idx;

delete from storage.buckets where id = 'invoices';

commit;

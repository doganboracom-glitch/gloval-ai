-- 078: manual invoice management.
-- Adds public.invoices, public.invoice_audit, the private `invoices` storage
-- bucket and one supporting index. Does not modify or delete any existing row.
-- All access is server-side (service role); customers get column-limited,
-- own-row SELECT only. Idempotent.

begin;
set local lock_timeout = '5s';

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  billing_transaction_id uuid not null
    references public.billing_transactions(id) on delete restrict,
  invoice_type text not null default 'invoice',
  status text not null,
  invoice_number text,
  invoice_date date,
  amount_kurus integer not null,
  currency text not null default 'TRY',
  billing_snapshot jsonb,
  file_path text,
  file_name text,
  file_size integer,
  file_sha256 text,
  source text not null default 'manual',
  provider_ref text,
  not_required_reason text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoices_invoice_type_check check (invoice_type in ('invoice')),
  constraint invoices_status_check check (status in ('uploaded', 'not_required')),
  constraint invoices_source_check check (source in ('manual', 'integrator')),
  constraint invoices_amount_check check (amount_kurus >= 0),
  constraint invoices_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint invoices_file_size_check
    check (file_size is null or file_size between 1 and 5242880),
  constraint invoices_file_sha256_check
    check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint invoices_invoice_number_check
    check (invoice_number is null or char_length(btrim(invoice_number)) between 1 and 64),
  constraint invoices_file_path_check
    check (file_path is null or file_path ~ '^([0-9a-f-]{36}|_unassigned)/[0-9a-f-]{36}\.pdf$'),
  constraint invoices_file_name_check
    check (file_name is null or char_length(file_name) between 1 and 200),
  constraint invoices_not_required_reason_check
    check (not_required_reason is null or char_length(btrim(not_required_reason)) between 3 and 500),
  constraint invoices_state_check check (
    (status = 'uploaded'
      and invoice_number is not null
      and invoice_date is not null
      and file_path is not null
      and file_name is not null
      and file_size is not null
      and file_sha256 is not null
      and billing_snapshot is not null
      and not_required_reason is null)
    or
    (status = 'not_required'
      and not_required_reason is not null
      and invoice_number is null
      and invoice_date is null
      and file_path is null
      and file_name is null
      and file_size is null
      and file_sha256 is null)
  )
);

-- One invoice record per payment. Replacing a file updates the same row.
create unique index if not exists invoices_billing_tx_uidx
  on public.invoices (billing_transaction_id)
  where invoice_type = 'invoice';

create unique index if not exists invoices_number_uidx
  on public.invoices (lower(btrim(invoice_number)))
  where status = 'uploaded';

create index if not exists invoices_user_created_idx
  on public.invoices (user_id, created_at desc);

-- Supports the "succeeded and no invoice yet" admin list.
create index if not exists billing_transactions_succeeded_created_idx
  on public.billing_transactions (created_at desc)
  where status = 'succeeded';

create or replace function public.invoices_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.invoices_touch_updated_at() from public, anon, authenticated, service_role;

drop trigger if exists invoices_touch_updated_at on public.invoices;
create trigger invoices_touch_updated_at
  before update on public.invoices
  for each row execute function public.invoices_touch_updated_at();

alter table public.invoices enable row level security;

revoke all on table public.invoices from public, anon, authenticated;
-- Customers may read only non-sensitive columns of their own rows
-- (no billing_snapshot, file_path, file_sha256, uploaded_by, reason).
grant select (
  id, user_id, billing_transaction_id, invoice_type, status,
  invoice_number, invoice_date, amount_kurus, currency, source,
  created_at, updated_at
) on table public.invoices to authenticated;

drop policy if exists invoices_owner_read on public.invoices;
create policy invoices_owner_read on public.invoices
  for select to authenticated
  using (auth.uid() = user_id);

-- Financial records: the server can insert/update but never delete.
revoke delete, truncate, references, trigger on table public.invoices from service_role;
grant select, insert, update on table public.invoices to service_role;

-- Append-only audit trail. Never stores TCKN/VKN or file contents.
create table if not exists public.invoice_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null,
  invoice_id uuid,
  billing_transaction_id uuid,
  detail jsonb,
  constraint invoice_audit_action_check check (action in (
    'invoice.upload',
    'invoice.replace',
    'invoice.mark_not_required',
    'invoice.download_admin',
    'invoice.download_customer',
    'invoice.export_csv'
  ))
);

create index if not exists invoice_audit_at_idx on public.invoice_audit (at desc);
create index if not exists invoice_audit_invoice_idx
  on public.invoice_audit (invoice_id) where invoice_id is not null;

alter table public.invoice_audit enable row level security;
revoke all on table public.invoice_audit from public, anon, authenticated;
revoke update, delete, truncate, references, trigger on table public.invoice_audit from service_role;
grant select, insert on table public.invoice_audit to service_role;

create or replace function public.block_invoice_audit_mutations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'invoice_audit is append-only';
end;
$$;

revoke all on function public.block_invoice_audit_mutations() from public, anon, authenticated, service_role;

drop trigger if exists invoice_audit_no_mutation on public.invoice_audit;
create trigger invoice_audit_no_mutation
  before update or delete on public.invoice_audit
  for each row execute function public.block_invoice_audit_mutations();

-- Private bucket. No storage.objects policies on purpose: customers have no
-- direct access; downloads are short-lived signed URLs minted on the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

commit;

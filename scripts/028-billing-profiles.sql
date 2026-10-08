-- Billing profiles are user-owned invoice details, including Turkish tax IDs.
-- Access is server-only: authenticated/anon receive no table privileges or RLS policies.
create table if not exists public.billing_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_type text not null,
  full_name text,
  company_title text,
  tax_office text,
  tax_number text,
  national_id text,
  address_line text not null,
  district text not null,
  city text not null,
  postal_code text,
  country text not null default 'TR',
  phone text not null,
  invoice_email text not null,
  e_invoice_payer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_profiles_customer_type_check
    check (customer_type in ('individual', 'company')),
  constraint billing_profiles_full_name_check
    check (full_name is null or char_length(btrim(full_name)) between 2 and 160),
  constraint billing_profiles_company_title_check
    check (company_title is null or char_length(btrim(company_title)) between 2 and 200),
  constraint billing_profiles_tax_office_check
    check (tax_office is null or char_length(btrim(tax_office)) between 2 and 120),
  constraint billing_profiles_customer_identity_check
    check (
      (customer_type = 'individual'
        and nullif(btrim(full_name), '') is not null
        and national_id is not null
        and national_id ~ '^[1-9][0-9]{10}$'
        and company_title is null
        and tax_office is null
        and tax_number is null)
      or
      (customer_type = 'company'
        and nullif(btrim(company_title), '') is not null
        and nullif(btrim(tax_office), '') is not null
        and tax_number is not null
        and tax_number ~ '^[0-9]{10}$'
        and national_id is null)
    ),
  constraint billing_profiles_address_check
    check (char_length(btrim(address_line)) between 5 and 240),
  constraint billing_profiles_district_check
    check (char_length(btrim(district)) between 2 and 100),
  constraint billing_profiles_city_check
    check (char_length(btrim(city)) between 2 and 100),
  constraint billing_profiles_postal_code_check
    check (postal_code is null or char_length(btrim(postal_code)) between 1 and 20),
  constraint billing_profiles_country_check
    check (country ~ '^[A-Z]{2}$'),
  constraint billing_profiles_phone_check
    check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint billing_profiles_invoice_email_check
    check (char_length(invoice_email) <= 254 and invoice_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

alter table public.billing_profiles enable row level security;
revoke all on table public.billing_profiles from public, anon, authenticated;
revoke delete, truncate, references, trigger on table public.billing_profiles from service_role;
grant select, insert, update on table public.billing_profiles to service_role;

-- CSV exports are sensitive read operations, so record the actor, filter, and
-- number of rows without duplicating any of the exported personal data.
create table if not exists public.billing_profile_export_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_email text not null,
  admin_user_id uuid,
  export_filter text not null check (export_filter in ('all', 'incomplete', 'complete')),
  row_count integer not null check (row_count >= 0)
);

alter table public.billing_profile_export_audit enable row level security;
revoke all on table public.billing_profile_export_audit from public, anon, authenticated;
revoke update, delete, truncate, references, trigger on table public.billing_profile_export_audit from service_role;
grant select, insert on table public.billing_profile_export_audit to service_role;

create or replace function public.block_billing_profile_export_audit_mutations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'billing_profile_export_audit is append-only';
end;
$$;

revoke all on function public.block_billing_profile_export_audit_mutations() from public, anon, authenticated, service_role;
drop trigger if exists billing_profile_export_audit_no_mutation on public.billing_profile_export_audit;
create trigger billing_profile_export_audit_no_mutation
  before update or delete on public.billing_profile_export_audit
  for each row execute function public.block_billing_profile_export_audit_mutations();

create index if not exists billing_profile_export_audit_created_idx
  on public.billing_profile_export_audit (created_at desc);

-- Do not apply this file as part of feature development; deploy it separately
-- after the application code has been reviewed.


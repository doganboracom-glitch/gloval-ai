create table if not exists public.billing_profile_reveal_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_email text not null,
  admin_user_id uuid not null,
  target_user_id uuid not null,
  field text not null check (field in ('national_id', 'tax_number'))
);

alter table public.billing_profile_reveal_audit enable row level security;
revoke all on public.billing_profile_reveal_audit from anon, authenticated, public;
grant select, insert on public.billing_profile_reveal_audit to service_role;
revoke update, delete, truncate, references, trigger on public.billing_profile_reveal_audit from service_role;

create or replace function public.prevent_billing_profile_reveal_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'billing_profile_reveal_audit is append-only';
end;
$$;

drop trigger if exists billing_profile_reveal_audit_immutable on public.billing_profile_reveal_audit;
create trigger billing_profile_reveal_audit_immutable
before update or delete on public.billing_profile_reveal_audit
for each row execute function public.prevent_billing_profile_reveal_audit_mutation();

create index if not exists billing_profile_reveal_audit_created_at_idx
on public.billing_profile_reveal_audit (created_at desc);
create index if not exists billing_profile_reveal_audit_admin_created_at_idx
on public.billing_profile_reveal_audit (admin_user_id, created_at desc);

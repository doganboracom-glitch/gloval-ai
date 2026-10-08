-- 024: admin "Ödeme bekleyenler" — contact notes + manual-payment / gift audit.
-- Idempotent. Service role only: RLS is enabled with NO policies, and every
-- privilege is revoked from anon/authenticated (no client can read or write).

create table if not exists public.admin_overdue_contact_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subscription_id uuid not null references public.billing_subscriptions(id) on delete cascade,
  user_id uuid not null,
  admin_email text not null,
  admin_user_id uuid,
  outcome text check (outcome in ('contacted', 'unreachable', 'promised')),
  promised_for date,
  note text not null check (char_length(btrim(note)) between 1 and 1000)
);
create index if not exists admin_overdue_contact_notes_sub_idx
  on public.admin_overdue_contact_notes (subscription_id, created_at desc);
create index if not exists admin_overdue_contact_notes_user_idx
  on public.admin_overdue_contact_notes (user_id, created_at desc);

create table if not exists public.admin_overdue_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_email text not null,
  admin_user_id uuid,
  target_user_id uuid not null,
  subscription_id uuid not null,
  action text not null check (action in ('mark_paid', 'gift')),
  months integer,
  amount_cents integer not null default 0,
  currency text not null default 'TRY',
  provider text,
  provider_managed boolean not null default false,
  prev_status text,
  new_status text,
  prev_period_end timestamptz,
  new_period_end timestamptz,
  reason text not null check (char_length(btrim(reason)) >= 3),
  idempotency_key text
);
create unique index if not exists admin_overdue_audit_idem_key
  on public.admin_overdue_audit (idempotency_key) where idempotency_key is not null;
create index if not exists admin_overdue_audit_sub_idx
  on public.admin_overdue_audit (subscription_id, created_at desc);
create index if not exists admin_overdue_audit_user_idx
  on public.admin_overdue_audit (target_user_id, created_at desc);

create or replace function public.admin_overdue_audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'admin_overdue_audit is append-only';
end $$;
drop trigger if exists admin_overdue_audit_no_update on public.admin_overdue_audit;
create trigger admin_overdue_audit_no_update before update or delete on public.admin_overdue_audit
  for each row execute function public.admin_overdue_audit_immutable();

alter table public.admin_overdue_contact_notes enable row level security;
alter table public.admin_overdue_audit enable row level security;

revoke all on public.admin_overdue_contact_notes from anon, authenticated;
revoke all on public.admin_overdue_audit from anon, authenticated;
grant select, insert on public.admin_overdue_contact_notes to service_role;
grant select, insert on public.admin_overdue_audit to service_role;

-- 016: inbound (transfer-in) domain transfer orders.
-- NOT YET APPLIED. Review, then run manually in the Supabase SQL editor.
-- Outbound transfers need no table: they are read live from the registrar.
-- The EPP/auth code is stored only AES-256-GCM encrypted (auth_code_enc) and is
-- nulled the moment it is sent to the registrar or the order fails.

create table if not exists public.domain_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  tld text not null,
  direction text not null default 'in' check (direction in ('in')),
  period_years integer not null default 1 check (period_years between 1 and 10),
  status text not null default 'pending_payment' check (status in (
    'pending_payment','payment_verified','transfer_submitting','transfer_pending',
    'completed','failed','cancelled'
  )),
  price_cents integer not null,
  currency text not null,
  price_snapshot jsonb,
  payment_provider text,
  payment_reference text unique,
  auth_code_enc text,
  provider_status text,
  error_message text,
  provider_domain_id text,
  custom_domain_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists domain_transfers_user_idx on public.domain_transfers (user_id, created_at desc);
-- At most one open inbound transfer per user+domain.
create unique index if not exists domain_transfers_open_uniq
  on public.domain_transfers (user_id, domain)
  where status in ('pending_payment','payment_verified','transfer_submitting','transfer_pending');

-- Server-only table: RLS on with no policies; access goes through the service role.
alter table public.domain_transfers enable row level security;

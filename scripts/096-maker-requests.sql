-- NOT APPLIED: This migration is intentionally written to disk only.
-- Apply it manually before enabling MAKER_REQUESTS_ENABLED=1.

create table if not exists public.maker_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  phone text not null check (char_length(phone) between 7 and 32),
  email text not null check (char_length(email) between 3 and 254),
  budget_range text not null check (budget_range in ('5000-10000', '10000-25000', '25000-plus')),
  reference_links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reference_links) = 'array' and jsonb_array_length(reference_links) <= 5),
  status text not null default 'new' check (status in ('new', 'answered', 'closed')),
  consent_version text not null,
  consent_at timestamptz not null default now(),
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  admin_notes text not null default '',
  reply_text text,
  replied_at timestamptz
);

create index if not exists maker_requests_created_at_idx
  on public.maker_requests (created_at desc);

create index if not exists maker_requests_status_created_at_idx
  on public.maker_requests (status, created_at desc);

alter table public.maker_requests enable row level security;

revoke all on table public.maker_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.maker_requests to service_role;

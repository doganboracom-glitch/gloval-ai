-- Server-side hand-off of a logged-out visitor's draft site (see lib/signup-draft-store.ts).
-- NOT applied automatically: review, then run once. Idempotent.
--
-- The draft is bound to the sign-up e-mail and to a one-time claim token. Only the
-- SHA-256 hash of the token is stored; the token itself travels in the verification
-- link. The row is readable ONLY through the service_role (RLS on, no policies, all
-- client grants revoked), so no signed-in user can ever list or read another user's draft.

create table if not exists public.signup_drafts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  ip_hash text
);

-- Safe on a table created by an earlier revision of this script.
alter table public.signup_drafts add column if not exists ip_hash text;

create index if not exists signup_drafts_expires_at_idx
  on public.signup_drafts (expires_at);

-- Abuse limits: drafts per IP per hour, and active drafts per e-mail.
create index if not exists signup_drafts_ip_hash_created_at_idx
  on public.signup_drafts (ip_hash, created_at) where ip_hash is not null;

create index if not exists signup_drafts_email_active_idx
  on public.signup_drafts (email) where consumed_at is null;

alter table public.signup_drafts enable row level security;

revoke all on public.signup_drafts from anon, authenticated;

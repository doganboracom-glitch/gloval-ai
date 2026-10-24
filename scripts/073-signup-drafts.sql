-- Server-side hand-off of a logged-out visitor's draft site (see lib/signup-draft-store.ts).
-- NOT applied automatically: review, then run once. Idempotent.
--
-- The draft is bound to the sign-up e-mail and to a one-time claim token. Only the
-- SHA-256 hash of the token is stored; the token itself travels in the verification
-- link. The row is readable ONLY through the service_role (RLS on, no policies, all
-- client grants revoked), so no signed-in user can ever list or read another user's draft.
--
-- Personal data held per row: `email` and `payload` (site name, prompt, generated site
-- content, which may contain the visitor's business contact details). No raw IP is
-- stored (per-IP limiting uses HMAC-hashed counters in rate_limit_counters, see 061).
-- Retention: expires_at = created_at + 7 days; the daily cron deletes expired rows and
-- rows consumed more than 1 hour ago. On consumption the app blanks `email` and
-- reduces `payload` to {"publishIntent": bool}. Deleting the auth user cascades.
-- Triggers: none are needed or defined.

create table if not exists public.signup_drafts (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null
);

comment on table public.signup_drafts is
  'Pre-signup draft site hand-off. Contains personal data (e-mail, site content). Service-role only; swept daily (7-day TTL, 1h after use).';

-- Defence in depth behind the app-side 200 KB cap (jsonb text form is slightly larger).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'signup_drafts_payload_size_chk') then
    alter table public.signup_drafts
      add constraint signup_drafts_payload_size_chk check (octet_length(payload::text) <= 262144);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'signup_drafts_email_len_chk') then
    alter table public.signup_drafts
      add constraint signup_drafts_email_len_chk check (char_length(email) <= 320);
  end if;
end
$$;

-- Sweep (expiry) and the active-draft counts used by the per-e-mail / global caps.
create index if not exists signup_drafts_expires_at_idx
  on public.signup_drafts (expires_at);

create index if not exists signup_drafts_created_at_idx
  on public.signup_drafts (created_at);

create index if not exists signup_drafts_consumed_at_idx
  on public.signup_drafts (consumed_at)
  where consumed_at is not null;

create index if not exists signup_drafts_email_active_idx
  on public.signup_drafts (email)
  where consumed_at is null;

alter table public.signup_drafts enable row level security;

-- No policy may exist: drop any that were ever added by hand.
do $$
declare
  p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'signup_drafts'
  loop
    execute format('drop policy %I on public.signup_drafts', p.policyname);
  end loop;
end
$$;

revoke all on public.signup_drafts from public, anon, authenticated;
grant select, insert, update, delete on public.signup_drafts to service_role;

-- Verification (run manually after applying; expect false, false, 0):
--   select has_table_privilege('anon', 'public.signup_drafts', 'select'),
--          has_table_privilege('authenticated', 'public.signup_drafts', 'select'),
--          (select count(*) from pg_policies
--             where schemaname = 'public' and tablename = 'signup_drafts');

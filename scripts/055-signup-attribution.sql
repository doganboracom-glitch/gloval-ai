-- First-touch marketing attribution captured at sign-up (UTM + ad click IDs).
-- Written only by the `saveSignupAttribution` server action via the service
-- role; RLS is enabled with no policies, so anon/authenticated clients cannot
-- read or write it.

create table if not exists public.signup_attribution (
  user_id uuid primary key references auth.users (id) on delete cascade,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  gclid text,
  fbclid text,
  landing_path text,
  referrer_domain text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.signup_attribution enable row level security;

revoke all on public.signup_attribution from anon, authenticated;

create index if not exists signup_attribution_utm_source_idx
  on public.signup_attribution (utm_source, created_at desc);

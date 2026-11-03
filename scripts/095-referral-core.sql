-- NOT APPLIED: referral attribution core; intentionally left unapplied by this change.
-- All tables are service-role only; no client-facing policies are created.

create table if not exists public.referral_partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  referral_code text not null unique
    check (referral_code ~ '^[A-Z0-9]{8,16}$'),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  terms_version text,
  terms_accepted_at timestamptz,
  payee_name text,
  tax_status text,
  iban_ciphertext text,
  iban_key_version text,
  iban_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid unique references auth.users(id) on delete set null,
  partner_id uuid not null references public.referral_partners(id) on delete restrict,
  code_snapshot text not null check (code_snapshot ~ '^[A-Z0-9]{8,16}$'),
  source text not null check (source in ('email', 'oauth')),
  captured_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists referral_attributions_partner_created_idx
  on public.referral_attributions (partner_id, created_at desc);

create or replace function public.touch_referral_partner_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_referral_partner_updated_at() from public, anon, authenticated;
grant execute on function public.touch_referral_partner_updated_at() to service_role;

drop trigger if exists referral_partners_touch_updated_at on public.referral_partners;
create trigger referral_partners_touch_updated_at
before update on public.referral_partners
for each row execute function public.touch_referral_partner_updated_at();

create table if not exists public.referral_daily_clicks (
  partner_id uuid not null references public.referral_partners(id) on delete cascade,
  click_date date not null,
  unique_clicks bigint not null default 0 check (unique_clicks >= 0),
  primary key (partner_id, click_date)
);

create table if not exists public.referral_click_dedup (
  partner_id uuid not null references public.referral_partners(id) on delete cascade,
  click_date date not null,
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  primary key (partner_id, click_date, subject_hash)
);

create index if not exists referral_click_dedup_expires_at_idx
  on public.referral_click_dedup (expires_at);

-- Signup intent tokens contain a random nonce. Only its SHA-256 digest is stored;
-- consumed_at and expires_at make replay protection atomic across instances.
create table if not exists public.referral_signup_intents (
  intent_hash text primary key check (intent_hash ~ '^[a-f0-9]{64}$'),
  source text not null check (source in ('email', 'oauth')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > created_at)
);

create index if not exists referral_signup_intents_expires_at_idx
  on public.referral_signup_intents (expires_at);

alter table public.referral_partners enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_daily_clicks enable row level security;
alter table public.referral_click_dedup enable row level security;
alter table public.referral_signup_intents enable row level security;

revoke all on table public.referral_partners from public, anon, authenticated;
revoke all on table public.referral_attributions from public, anon, authenticated;
revoke all on table public.referral_daily_clicks from public, anon, authenticated;
revoke all on table public.referral_click_dedup from public, anon, authenticated;
revoke all on table public.referral_signup_intents from public, anon, authenticated;

grant select, insert, update, delete on table public.referral_partners to service_role;
grant select, insert, update, delete on table public.referral_attributions to service_role;
grant select, insert, update, delete on table public.referral_daily_clicks to service_role;
grant select, insert, update, delete on table public.referral_click_dedup to service_role;
grant select, insert, update, delete on table public.referral_signup_intents to service_role;

create or replace function public.record_referral_click(
  p_partner_id uuid,
  p_subject_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_click_date date := (now() at time zone 'UTC')::date;
  v_inserted integer;
begin
  if p_subject_hash is null or p_subject_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  if not exists (
    select 1
    from public.referral_partners
    where id = p_partner_id
      and status = 'active'
      and user_id is not null
  ) then
    return false;
  end if;

  delete from public.referral_click_dedup where expires_at <= now();
  delete from public.referral_signup_intents where expires_at <= now();

  insert into public.referral_click_dedup (partner_id, click_date, subject_hash, expires_at)
  values (p_partner_id, v_click_date, p_subject_hash, now() + interval '24 hours')
  on conflict (partner_id, click_date, subject_hash) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  insert into public.referral_daily_clicks (partner_id, click_date, unique_clicks)
  values (p_partner_id, v_click_date, 1)
  on conflict (partner_id, click_date) do update
    set unique_clicks = public.referral_daily_clicks.unique_clicks + 1;

  return true;
end;
$$;

revoke all on function public.record_referral_click(uuid, text) from public, anon, authenticated;
grant execute on function public.record_referral_click(uuid, text) to service_role;

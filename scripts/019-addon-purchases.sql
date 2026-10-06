-- Add-on purchase records (data model only; no payment flow is wired to it yet).
--
-- One row per add-on purchase attempt. `amount` / `currency` are a SNAPSHOT of the
-- catalog price (billing_plans.price_cents) at purchase time, in minor units (kurus),
-- so later catalog changes never rewrite history. `period_end_snapshot` is the
-- subscription's current_period_end at purchase time; the entitlement derived from a
-- purchase stays valid only until the live subscription period ends.
-- Capacity is NOT stored here: it lives in lib/add-ons.ts (ADD_ONS) and the
-- user_addon_entitlements grant. This table only records the money side.

create table if not exists public.addon_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.billing_subscriptions (id) on delete cascade,
  addon_code text not null references public.billing_plans (code) on update cascade on delete restrict,
  amount integer not null check (amount > 0),
  currency text not null default 'TRY' check (char_length(currency) = 3),
  period_end_snapshot timestamptz not null,
  status text not null default 'pending' check (status in (
    'pending',
    'paid',
    'granted',
    'failed',
    'manual_refund_required'
  )),
  provider text not null,
  -- Null until the payment intent exists; unique once set so one PSP reference can
  -- never settle two purchases.
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addon_purchases_provider_ref_key unique (provider_ref)
);

create index if not exists addon_purchases_user_created_idx
  on public.addon_purchases (user_id, created_at desc);

create index if not exists addon_purchases_subscription_idx
  on public.addon_purchases (subscription_id);

-- Reconciliation scans look for purchases stuck short of a final state.
create index if not exists addon_purchases_open_status_idx
  on public.addon_purchases (status, updated_at)
  where status in ('pending', 'paid');

create or replace function public.addon_purchases_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists addon_purchases_touch_updated_at on public.addon_purchases;
create trigger addon_purchases_touch_updated_at
  before update on public.addon_purchases
  for each row execute function public.addon_purchases_touch_updated_at();

-- RLS: owners may read their own purchases. There is no insert/update/delete policy
-- and the table privileges are revoked, so every write goes through the service role.
alter table public.addon_purchases enable row level security;

drop policy if exists "addon_purchases_select_own" on public.addon_purchases;
create policy "addon_purchases_select_own"
  on public.addon_purchases for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.addon_purchases from public, anon, authenticated;
grant select on public.addon_purchases to authenticated;
grant all on public.addon_purchases to service_role;

-- A purchase produces at most one entitlement. Nullable so rows that predate the
-- purchase flow stay valid; a plain unique constraint permits many NULLs.
alter table public.user_addon_entitlements
  add column if not exists purchase_id uuid
    references public.addon_purchases (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_addon_entitlements_purchase_id_key'
      and conrelid = 'public.user_addon_entitlements'::regclass
  ) then
    alter table public.user_addon_entitlements
      add constraint user_addon_entitlements_purchase_id_key unique (purchase_id);
  end if;
end;
$$;

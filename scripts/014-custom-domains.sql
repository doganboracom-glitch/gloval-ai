-- 014: persistent custom domain registry (FAZ 1).
--
-- Replaces the in-memory Map in lib/custom-domains/mock-provider.ts, which lost
-- every domain on restart / serverless cold start (so purchased domains vanished
-- and middleware could never resolve a bound host).
--
-- NOT applied automatically. Review, then apply with the Supabase SQL editor /
-- migration tool. The script is idempotent and never deletes data.
--
-- Access model: customers may only READ their own rows. All writes go through
-- server actions using the service-role client after an ownership check, so a
-- signed-in user cannot self-set status = 'active' or hijack another tenant's
-- binding with a direct PostgREST call.

create table if not exists public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  status text not null default 'pending'
    check (status in ('pending', 'verifying', 'active', 'failed', 'disabled')),
  is_primary boolean not null default false,
  provider text not null default 'supabase',
  dns jsonb not null default '[]'::jsonb,
  website_project_id uuid references public.projects(id) on delete set null,
  email_enabled boolean not null default false,
  order_id uuid references public.domain_orders(id) on delete set null,
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_domains_domain_normalized check (domain = lower(btrim(domain)))
);

-- Only a DNS-verified domain is a platform-wide ownership claim. Pending and
-- failed attempts remain available for another user to add and verify.
-- The index also supports the middleware host lookup.
create unique index if not exists custom_domains_active_domain_unique
  on public.custom_domains (domain)
  where status = 'active';

-- At most one primary per user.
create unique index if not exists custom_domains_one_primary_per_user
  on public.custom_domains (user_id) where is_primary;

-- One domain row per purchase order (makes finalizeDomainOrder idempotent).
create unique index if not exists custom_domains_order_unique
  on public.custom_domains (order_id) where order_id is not null;

create index if not exists custom_domains_user_idx
  on public.custom_domains (user_id, created_at desc);

create index if not exists custom_domains_project_idx
  on public.custom_domains (website_project_id) where website_project_id is not null;

alter table public.custom_domains enable row level security;

drop policy if exists "custom_domains_select_own" on public.custom_domains;
create policy "custom_domains_select_own" on public.custom_domains
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Intentionally no insert/update/delete policies for anon/authenticated.

create or replace function public.custom_domains_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists custom_domains_touch on public.custom_domains;
create trigger custom_domains_touch
  before update on public.custom_domains
  for each row execute function public.custom_domains_touch_updated_at();

-- Recover already-purchased domains. Their old custom_domain_id pointed at an
-- in-memory id that no longer exists. Registrar-bought domains are owned by us
-- on the customer's behalf, so they are 'active' (same rule finalizeDomainOrder
-- applies). Skipped if the hostname is already present.
insert into public.custom_domains
  (user_id, domain, status, is_primary, provider, dns, order_id, verified_at, expires_at, created_at)
select
  o.user_id,
  lower(btrim(o.domain)),
  'active',
  -- Only the user's oldest recovered order becomes primary, and only if they
  -- have no primary yet. Ranking inside the statement avoids two rows of one
  -- user both claiming primary (which would trip the partial unique index and
  -- be silently skipped by ON CONFLICT DO NOTHING).
  (row_number() over (partition by o.user_id order by o.created_at, o.id) = 1)
    and not exists (select 1 from public.custom_domains c where c.user_id = o.user_id and c.is_primary),
  'domainnameapi',
  '[]'::jsonb,
  o.id,
  coalesce(o.updated_at, now()),
  o.expires_at,
  o.created_at
from public.domain_orders o
where o.status = 'active'
on conflict do nothing;

update public.domain_orders o
set custom_domain_id = c.id::text
from public.custom_domains c
where c.order_id = o.id
  and (o.custom_domain_id is distinct from c.id::text);

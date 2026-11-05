-- UNAPPLIED — review and apply through the approved database migration workflow.
-- 112-domain-transfer-windows.sql

create table if not exists public.domain_transfer_windows (
  id uuid primary key default gen_random_uuid(),
  custom_domain_id uuid references public.custom_domains(id) on delete set null,
  domain text not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'relocked', 'cancelled', 'failed')),
  opened_at timestamptz not null default now(),
  relock_at timestamptz not null,
  extensions integer not null default 0 check (extensions between 0 and 2),
  relock_attempts integer not null default 0 check (relock_attempts >= 0),
  last_error_code text,
  closed_at timestamptz,
  reminder_sent_at timestamptz,
  relock_lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.domain_transfer_windows
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists relock_lease_until timestamptz;

create unique index if not exists domain_transfer_windows_one_open_per_domain
  on public.domain_transfer_windows (domain)
  where status = 'open';

create index if not exists domain_transfer_windows_due_relock_idx
  on public.domain_transfer_windows (status, relock_at)
  where status = 'open';

alter table public.domain_transfer_windows enable row level security;

revoke all on table public.domain_transfer_windows from public, anon, authenticated;
grant select, insert, update on table public.domain_transfer_windows to service_role;
revoke truncate, delete, references, trigger on table public.domain_transfer_windows from service_role;

create or replace function public.set_domain_transfer_windows_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_domain_transfer_windows_updated_at() from public, anon, authenticated;

drop trigger if exists domain_transfer_windows_updated_at on public.domain_transfer_windows;
create trigger domain_transfer_windows_updated_at
  before update on public.domain_transfer_windows
  for each row
  execute function public.set_domain_transfer_windows_updated_at();

create or replace function public.claim_due_domain_transfer_windows(p_limit integer default 20)
returns setof public.domain_transfer_windows
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select w.id
    from public.domain_transfer_windows as w
    where w.status = 'open'
      and w.relock_at <= pg_catalog.now()
      and (w.relock_lease_until is null or w.relock_lease_until <= pg_catalog.now())
    order by w.relock_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 20))
  )
  update public.domain_transfer_windows as w
  set relock_lease_until = pg_catalog.now() + interval '10 minutes'
  from due
  where w.id = due.id
  returning w.*;
end;
$$;

revoke all on function public.claim_due_domain_transfer_windows(integer) from public, anon, authenticated;
grant execute on function public.claim_due_domain_transfer_windows(integer) to service_role;

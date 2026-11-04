-- UNAPPLIED — apply manually after review; this task does not mutate the live database.
-- Append-only audit trail for registrar-side domain mutations.
-- `details` must never hold a transfer code, nameserver values or personal data:
-- only outcomes and counts (the application enforces an allow-list of keys).

create table if not exists public.domain_audit_events (
  id uuid primary key default gen_random_uuid(),
  custom_domain_id uuid references public.custom_domains(id) on delete set null,
  domain text not null,
  user_id uuid references auth.users(id) on delete set null,
  actor text not null check (actor in ('user', 'admin', 'system')),
  event_type text not null check (
    event_type in (
      'nameservers_updated',
      'transfer_lock_changed',
      'transfer_code_viewed',
      'contacts_updated',
      'renewal_started',
      'renewal_completed'
    )
  ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists domain_audit_events_domain_created_idx
  on public.domain_audit_events (custom_domain_id, created_at desc);
create index if not exists domain_audit_events_user_created_idx
  on public.domain_audit_events (user_id, created_at desc);

alter table public.domain_audit_events enable row level security;

revoke all on public.domain_audit_events from public, anon, authenticated;
grant select, insert on public.domain_audit_events to service_role;

-- Append-only. DELETE is always refused. UPDATE is refused too, except the
-- referential `on delete set null` that clears custom_domain_id / user_id when
-- the referenced domain or account is removed (that must keep working).
create or replace function public.domain_audit_events_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'domain_audit_events is append-only';
  end if;

  if new.id is distinct from old.id
     or new.domain is distinct from old.domain
     or new.actor is distinct from old.actor
     or new.event_type is distinct from old.event_type
     or new.details is distinct from old.details
     or new.created_at is distinct from old.created_at
     or (new.custom_domain_id is not null and new.custom_domain_id is distinct from old.custom_domain_id)
     or (new.user_id is not null and new.user_id is distinct from old.user_id)
  then
    raise exception 'domain_audit_events is append-only';
  end if;

  return new;
end;
$$;

drop trigger if exists domain_audit_events_append_only on public.domain_audit_events;
create trigger domain_audit_events_append_only
  before update or delete on public.domain_audit_events
  for each row execute function public.domain_audit_events_append_only();

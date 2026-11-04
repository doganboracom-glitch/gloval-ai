-- scripts/105-admin-domain-import.sql
-- *** NOT APPLIED to any database. Review/PR only. ***
-- Prerequisite: scripts/086-domain-ownership-handover.sql has been applied.
-- Imports an already-owned DomainNameAPI domain into a GLOVAL user's domain list.
-- This script adds no registrar, WHOIS, payment, mail, DNS, or Vercel side effects.
-- The application verifies ownership with DomainNameAPI GetDetails before each write.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Record successful administrative imports in the existing append-only audit stream.
alter table public.domain_handover_events
  drop constraint if exists domain_handover_events_event_check;
alter table public.domain_handover_events
  add constraint domain_handover_events_event_check
  check (event in (
    'handover', 'hosting_detached', 'release_requested', 'hold_released',
    'reversed', 'notice_sent', 'notice_failed', 'admin_imported'
  ));

-- A request row is also the durable audit record for two-person approvals,
-- including decisions made before a custom_domains row exists.
create table if not exists public.domain_import_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  domain text not null,
  tld text not null,
  target_user_id uuid not null,
  target_email text not null,
  requested_by_user_id uuid not null,
  requested_by_email text not null,
  reason text not null,
  provider_domain_id text not null,
  expires_at timestamptz not null,
  registrar_nameservers text[] not null default '{}',
  initial_dns jsonb not null default '[]'::jsonb,
  verification_token text not null,
  requires_second_admin boolean not null,
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'imported', 'rejected')),
  decided_by_user_id uuid,
  decided_by_email text,
  decided_at timestamptz,
  decision_note text,
  domain_order_id uuid,
  custom_domain_id uuid,
  created_at timestamptz not null default now(),
  constraint domain_import_requests_domain_chk
    check (domain = lower(btrim(domain)) and char_length(domain) between 3 and 253),
  constraint domain_import_requests_reason_chk
    check (char_length(btrim(reason)) between 3 and 1000),
  constraint domain_import_requests_tld_chk
    check (tld = lower(btrim(tld)) and char_length(tld) between 2 and 63),
  constraint domain_import_requests_decision_chk
    check (
      (status = 'pending_approval' and decided_at is null)
      or (status in ('imported', 'rejected') and decided_at is not null)
    )
);

create unique index if not exists domain_import_requests_one_live_domain_idx
  on public.domain_import_requests (lower(domain))
  where status in ('pending_approval', 'imported');
create index if not exists domain_import_requests_pending_idx
  on public.domain_import_requests (created_at asc)
  where status = 'pending_approval';

alter table public.domain_import_requests enable row level security;
revoke all on public.domain_import_requests from public, anon, authenticated;
grant select on public.domain_import_requests to service_role;

comment on table public.domain_import_requests is
  'Service-role-only audit and approval queue for administrative registrar-domain imports. No WHOIS/contact data is stored.';
comment on column public.domain_import_requests.reason is
  'Required support ticket reference or administrative note; copied into the import audit snapshot.';
comment on column public.domain_import_requests.initial_dns is
  'GLOVAL-generated DNS ownership placeholder records only; not registrar data.';

-- Internal transaction: creates one free administrative order, its custom-domain
-- row, and the existing append-only audit event, or none of them.
create or replace function public._finalize_admin_domain_import(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_actor_email text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.domain_import_requests%rowtype;
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_banned_until timestamptz;
  v_order_id uuid;
  v_custom_domain_id uuid;
  v_actor_email text := lower(btrim(coalesce(p_actor_email, '')));
begin
  select * into v_request
    from public.domain_import_requests
    where id = p_request_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'request_not_found');
  end if;

  if v_request.status = 'imported' then
    return jsonb_build_object(
      'ok', true,
      'status', 'imported',
      'request_id', v_request.id,
      'domain', v_request.domain,
      'order_id', v_request.domain_order_id,
      'custom_domain_id', v_request.custom_domain_id,
      'requires_second_admin', v_request.requires_second_admin,
      'replayed', true
    );
  end if;
  if v_request.status <> 'pending_approval' then
    return jsonb_build_object('ok', false, 'code', 'request_closed');
  end if;
  if p_actor_user_id is null or v_actor_email = '' or char_length(v_actor_email) > 320 then
    return jsonb_build_object('ok', false, 'code', 'actor_invalid');
  end if;
  if v_request.requires_second_admin and (
    p_actor_user_id = v_request.requested_by_user_id
    or v_actor_email = lower(v_request.requested_by_email)
  ) then
    return jsonb_build_object('ok', false, 'code', 'second_admin_required');
  end if;
  if v_request.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'domain_expired');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-domain-import:' || v_request.domain, 0)
  );

  select u.email, u.email_confirmed_at, u.banned_until
    into v_user_email, v_email_confirmed_at, v_banned_until
    from auth.users as u
    where u.id = v_request.target_user_id
    for key share;
  if not found or lower(coalesce(v_user_email, '')) <> lower(v_request.target_email) then
    return jsonb_build_object('ok', false, 'code', 'target_not_found');
  end if;
  if v_email_confirmed_at is null then
    return jsonb_build_object('ok', false, 'code', 'target_not_confirmed');
  end if;
  if v_banned_until is not null and v_banned_until > now() then
    return jsonb_build_object('ok', false, 'code', 'target_inactive');
  end if;

  -- Any existing order/domain row is a deliberate stop, including stale or
  -- failed orders: an administrator must resolve the collision before retrying.
  if exists (
    select 1 from public.domain_orders as o
    where lower(btrim(o.domain)) = v_request.domain
  ) or exists (
    select 1 from public.custom_domains as d
    where lower(btrim(d.domain)) = v_request.domain
  ) then
    return jsonb_build_object('ok', false, 'code', 'domain_exists');
  end if;

  insert into public.domain_orders (
    user_id,
    domain,
    tld,
    period_years,
    status,
    price_cents,
    currency,
    price_snapshot,
    provider_response,
    payment_provider,
    provider_domain_id,
    expires_at
  ) values (
    v_request.target_user_id,
    v_request.domain,
    v_request.tld,
    1,
    'active',
    0,
    'TRY',
    jsonb_build_object(
      'source', 'admin_import',
      'sourceNote', v_request.reason,
      'provider', 'domainnameapi',
      'providerDomainId', v_request.provider_domain_id,
      'expiresAt', v_request.expires_at,
      'nameservers', to_jsonb(v_request.registrar_nameservers)
    ),
    jsonb_build_object('source', 'admin_import'),
    'admin_import',
    v_request.provider_domain_id,
    v_request.expires_at
  ) returning id into v_order_id;

  insert into public.custom_domains (
    user_id,
    domain,
    status,
    is_primary,
    dns,
    verification_token,
    provider,
    order_id,
    email_enabled,
    verified_at,
    expires_at
  ) values (
    v_request.target_user_id,
    v_request.domain,
    'active',
    false,
    v_request.initial_dns,
    v_request.verification_token,
    'domainnameapi',
    v_order_id,
    false,
    now(),
    v_request.expires_at
  ) returning id into v_custom_domain_id;

  update public.domain_orders
    set custom_domain_id = v_custom_domain_id::text
    where id = v_order_id;

  perform public._ensure_user_primary(v_request.target_user_id);

  update public.domain_import_requests
    set status = 'imported',
        decided_by_user_id = p_actor_user_id,
        decided_by_email = v_actor_email,
        decided_at = now(),
        domain_order_id = v_order_id,
        custom_domain_id = v_custom_domain_id
    where id = v_request.id;

  insert into public.domain_handover_events (
    handover_id,
    event,
    idempotency_key,
    custom_domain_id,
    domain,
    from_user_id,
    to_user_id,
    actor_email,
    reason,
    snapshot
  ) values (
    v_request.id,
    'admin_imported',
    v_request.idempotency_key,
    v_custom_domain_id,
    v_request.domain,
    null,
    v_request.target_user_id,
    v_actor_email,
    v_request.reason,
    jsonb_build_object(
      'source', 'admin_import',
      'requestId', v_request.id,
      'provider', 'domainnameapi',
      'providerDomainId', v_request.provider_domain_id,
      'expiresAt', v_request.expires_at,
      'nameservers', to_jsonb(v_request.registrar_nameservers),
      'targetEmail', v_request.target_email,
      'requestedByUserId', v_request.requested_by_user_id,
      'requestedByEmail', v_request.requested_by_email,
      'requestedAt', v_request.created_at,
      'decidedByUserId', p_actor_user_id,
      'decidedByEmail', v_actor_email,
      'decidedAt', now()
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'imported',
    'request_id', v_request.id,
    'domain', v_request.domain,
    'order_id', v_order_id,
    'custom_domain_id', v_custom_domain_id,
    'requires_second_admin', v_request.requires_second_admin,
    'replayed', false
  );
end;
$$;

-- Requests are created only after the server action has verified the domain
-- through the configured live registrar account and resolved the target email.
create or replace function public.admin_request_domain_import(
  p_domain text,
  p_tld text,
  p_target_user_id uuid,
  p_target_email text,
  p_requested_by_user_id uuid,
  p_requested_by_email text,
  p_reason text,
  p_idempotency_key text,
  p_provider_domain_id text,
  p_expires_at timestamptz,
  p_registrar_nameservers text[],
  p_initial_dns jsonb,
  p_verification_token text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_tld text := lower(btrim(coalesce(p_tld, '')));
  v_target_email text := lower(btrim(coalesce(p_target_email, '')));
  v_actor_email text := lower(btrim(coalesce(p_requested_by_email, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_request public.domain_import_requests%rowtype;
  v_previous public.domain_import_requests%rowtype;
  v_requires_second_admin boolean;
  v_result jsonb;
begin
  if char_length(v_domain) not between 3 and 253
     or v_domain !~ '^[a-z0-9.-]+$'
     or position('.' in v_domain) = 0
     or exists (
       select 1
       from pg_catalog.unnest(pg_catalog.string_to_array(v_domain, '.')) as labels(label)
       where char_length(label) not between 1 and 63
          or label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
     ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_domain');
  end if;
  if char_length(v_tld) not between 2 and 63
     or v_tld !~ '^[a-z0-9.-]+$'
     or right(v_domain, char_length(v_tld) + 1) <> '.' || v_tld then
    return jsonb_build_object('ok', false, 'code', 'invalid_domain');
  end if;
  if p_target_user_id is null or v_target_email = '' or char_length(v_target_email) > 320
     or position('@' in v_target_email) < 2 then
    return jsonb_build_object('ok', false, 'code', 'target_not_found');
  end if;
  if p_requested_by_user_id is null or v_actor_email = '' or char_length(v_actor_email) > 320 then
    return jsonb_build_object('ok', false, 'code', 'actor_invalid');
  end if;
  if char_length(v_reason) not between 3 and 1000 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 8 and 80 then
    return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
  end if;
  if lower(btrim(coalesce(p_provider_domain_id, ''))) <> v_domain
     or p_expires_at is null or p_expires_at <= now()
     or char_length(coalesce(p_verification_token, '')) not between 16 and 128
     or jsonb_typeof(coalesce(p_initial_dns, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_initial_dns, '[]'::jsonb)) > 32
     or coalesce(array_length(p_registrar_nameservers, 1), 0) > 13
     or exists (
       select 1
       from pg_catalog.unnest(coalesce(p_registrar_nameservers, '{}'::text[])) as ns(value)
       where value is null or char_length(value) > 253
     ) then
    return jsonb_build_object('ok', false, 'code', 'registrar_unavailable');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-domain-import:' || v_domain, 0)
  );

  select * into v_request
    from public.domain_import_requests
    where idempotency_key = p_idempotency_key
    for update;
  if found then
    if v_request.domain <> v_domain
       or v_request.target_user_id <> p_target_user_id
       or v_request.requested_by_user_id <> p_requested_by_user_id
       or v_request.reason <> v_reason then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict');
    end if;
    return jsonb_build_object(
      'ok', true,
      'status', v_request.status,
      'request_id', v_request.id,
      'domain', v_request.domain,
      'order_id', v_request.domain_order_id,
      'custom_domain_id', v_request.custom_domain_id,
      'requires_second_admin', v_request.requires_second_admin,
      'replayed', true
    );
  end if;

  select * into v_previous
    from public.domain_import_requests
    where lower(domain) = v_domain
      and status in ('pending_approval', 'imported')
    for update;
  if found then
    if v_previous.status = 'pending_approval' then
      return jsonb_build_object('ok', false, 'code', 'import_pending');
    end if;
    return jsonb_build_object('ok', false, 'code', 'domain_exists');
  end if;

  if exists (
    select 1 from public.domain_orders as o
    where lower(btrim(o.domain)) = v_domain
  ) or exists (
    select 1 from public.custom_domains as d
    where lower(btrim(d.domain)) = v_domain
  ) then
    return jsonb_build_object('ok', false, 'code', 'domain_exists');
  end if;

  select coalesce(
    (select s.require_second_admin
       from public.domain_handover_settings as s
       where s.id = true),
    false
  ) into v_requires_second_admin;

  insert into public.domain_import_requests (
    idempotency_key,
    domain,
    tld,
    target_user_id,
    target_email,
    requested_by_user_id,
    requested_by_email,
    reason,
    provider_domain_id,
    expires_at,
    registrar_nameservers,
    initial_dns,
    verification_token,
    requires_second_admin,
    status
  ) values (
    p_idempotency_key,
    v_domain,
    v_tld,
    p_target_user_id,
    v_target_email,
    p_requested_by_user_id,
    v_actor_email,
    v_reason,
    v_domain,
    p_expires_at,
    coalesce(p_registrar_nameservers, '{}'::text[]),
    coalesce(p_initial_dns, '[]'::jsonb),
    p_verification_token,
    v_requires_second_admin,
    'pending_approval'
  ) returning * into v_request;

  if v_requires_second_admin then
    return jsonb_build_object(
      'ok', true,
      'status', 'pending_approval',
      'request_id', v_request.id,
      'domain', v_request.domain,
      'requires_second_admin', true,
      'replayed', false
    );
  end if;

  v_result := public._finalize_admin_domain_import(
    v_request.id,
    p_requested_by_user_id,
    v_actor_email
  );
  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'admin_domain_import_finalize_failed' using errcode = '40001';
  end if;
  return v_result;
end;
$$;

-- Approval refreshes the registrar snapshot before calling the same atomic
-- finalizer. The requesting admin can never approve their own request.
create or replace function public.admin_approve_domain_import(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_actor_email text,
  p_provider_domain_id text,
  p_expires_at timestamptz,
  p_registrar_nameservers text[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.domain_import_requests%rowtype;
  v_actor_email text := lower(btrim(coalesce(p_actor_email, '')));
begin
  select * into v_request
    from public.domain_import_requests
    where id = p_request_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'request_not_found');
  end if;
  if v_request.status = 'imported' then
    return jsonb_build_object(
      'ok', true,
      'status', 'imported',
      'request_id', v_request.id,
      'domain', v_request.domain,
      'order_id', v_request.domain_order_id,
      'custom_domain_id', v_request.custom_domain_id,
      'requires_second_admin', v_request.requires_second_admin,
      'replayed', true
    );
  end if;
  if v_request.status <> 'pending_approval' or not v_request.requires_second_admin then
    return jsonb_build_object('ok', false, 'code', 'request_closed');
  end if;
  if p_actor_user_id is null or v_actor_email = '' or char_length(v_actor_email) > 320 then
    return jsonb_build_object('ok', false, 'code', 'actor_invalid');
  end if;
  if p_actor_user_id = v_request.requested_by_user_id
     or v_actor_email = lower(v_request.requested_by_email) then
    return jsonb_build_object('ok', false, 'code', 'second_admin_required');
  end if;
  if lower(btrim(coalesce(p_provider_domain_id, ''))) <> v_request.domain
     or p_expires_at is null or p_expires_at <= now()
     or coalesce(array_length(p_registrar_nameservers, 1), 0) > 13
     or exists (
       select 1
       from pg_catalog.unnest(coalesce(p_registrar_nameservers, '{}'::text[])) as ns(value)
       where value is null or char_length(value) > 253
     ) then
    return jsonb_build_object('ok', false, 'code', 'registrar_unavailable');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-domain-import:' || v_request.domain, 0)
  );
  update public.domain_import_requests
    set provider_domain_id = v_request.domain,
        expires_at = p_expires_at,
        registrar_nameservers = coalesce(p_registrar_nameservers, '{}'::text[])
    where id = v_request.id;

  return public._finalize_admin_domain_import(p_request_id, p_actor_user_id, v_actor_email);
end;
$$;

create or replace function public.admin_reject_domain_import(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_actor_email text,
  p_decision_note text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.domain_import_requests%rowtype;
  v_actor_email text := lower(btrim(coalesce(p_actor_email, '')));
  v_note text := btrim(coalesce(p_decision_note, ''));
begin
  select * into v_request
    from public.domain_import_requests
    where id = p_request_id
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'request_not_found');
  end if;
  if v_request.status <> 'pending_approval' then
    return jsonb_build_object('ok', false, 'code', 'request_closed');
  end if;
  if p_actor_user_id is null or v_actor_email = '' or char_length(v_actor_email) > 320 then
    return jsonb_build_object('ok', false, 'code', 'actor_invalid');
  end if;
  if v_request.requires_second_admin and (
    p_actor_user_id = v_request.requested_by_user_id
    or v_actor_email = lower(v_request.requested_by_email)
  ) then
    return jsonb_build_object('ok', false, 'code', 'second_admin_required');
  end if;
  if char_length(v_note) not between 3 and 1000 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  update public.domain_import_requests
    set status = 'rejected',
        decided_by_user_id = p_actor_user_id,
        decided_by_email = v_actor_email,
        decided_at = now(),
        decision_note = v_note
    where id = v_request.id;

  return jsonb_build_object(
    'ok', true,
    'status', 'rejected',
    'request_id', v_request.id,
    'domain', v_request.domain,
    'requires_second_admin', v_request.requires_second_admin,
    'replayed', false
  );
end;
$$;

revoke all on function public._finalize_admin_domain_import(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_request_domain_import(text, text, uuid, text, uuid, text, text, text, text, timestamptz, text[], jsonb, text)
  from public, anon, authenticated;
revoke all on function public.admin_approve_domain_import(uuid, uuid, text, text, timestamptz, text[])
  from public, anon, authenticated;
revoke all on function public.admin_reject_domain_import(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_request_domain_import(text, text, uuid, text, uuid, text, text, text, text, timestamptz, text[], jsonb, text)
  to service_role;
grant execute on function public.admin_approve_domain_import(uuid, uuid, text, text, timestamptz, text[])
  to service_role;
grant execute on function public.admin_reject_domain_import(uuid, uuid, text, text)
  to service_role;

commit;

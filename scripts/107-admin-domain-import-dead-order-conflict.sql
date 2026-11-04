-- scripts/107-admin-domain-import-dead-order-conflict.sql
-- *** UNAPPLIED - onaysiz uygulanmayacak. NOT applied to any database. Review/PR only. ***
-- Prerequisite: scripts/105-admin-domain-import.sql has been applied.
-- No BEGIN/COMMIT on purpose: the migration runner (apply_migration) opens its own transaction.
--
-- Problem: _finalize_admin_domain_import / admin_request_domain_import rejected ANY
-- domain_orders row for the domain. A failed purchase attempt (status
-- 'registration_failed', provider_domain_id NULL) is not a real ownership record and
-- must not block an administrative import.
--
-- Rule (single source: public._admin_domain_import_conflict):
--   DEAD  (never a conflict by themselves): registration_failed, failed, cancelled
--         -> definitively failed attempts with no registrar record.
--   LIVE  (always a conflict): everything else - pending_payment, payment_verified,
--         registration_pending, registration_reconciliation_required, active,
--         manual_refund_required, and ANY status not listed as dead (fail safe).
--   TRACE: a DEAD row that carries BOTH payment_reference AND provider_domain_id
--         (payment + registrar trail) still counts as a conflict.
--   Also a conflict: any custom_domains row for the domain (any status), another
--   pending import request, another already-imported request.
-- Dead rows are never deleted or modified (iyzico payment trail stays for accounting).
--
-- domain_orders.status values (scripts/017-domain-reconciliation.sql CHECK):
--   pending_payment, payment_verified, registration_pending,
--   registration_reconciliation_required, active, registration_failed,
--   manual_refund_required, failed, cancelled

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Shared conflict check. Returns NULL when the domain is free, otherwise a code:
--   domain_linked  - already attached to an account (custom_domains / imported request)
--   import_pending - another import request for it is waiting for approval
--   order_active   - a live (or traced) order exists
create or replace function public._admin_domain_import_conflict(
  p_domain text,
  p_exclude_request_id uuid default null
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_domain text := lower(btrim(coalesce(p_domain, '')));
begin
  if exists (
    select 1 from public.custom_domains as d
    where lower(btrim(d.domain)) = v_domain
  ) then
    return 'domain_linked';
  end if;

  if exists (
    select 1 from public.domain_import_requests as r
    where lower(r.domain) = v_domain
      and r.status = 'pending_approval'
      and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
  ) then
    return 'import_pending';
  end if;

  if exists (
    select 1 from public.domain_import_requests as r
    where lower(r.domain) = v_domain
      and r.status = 'imported'
      and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
  ) then
    return 'domain_linked';
  end if;

  if exists (
    select 1 from public.domain_orders as o
    where lower(btrim(o.domain)) = v_domain
      and (
        coalesce(o.status, '') not in ('registration_failed', 'failed', 'cancelled')
        or (
          nullif(btrim(coalesce(o.payment_reference, '')), '') is not null
          and nullif(btrim(coalesce(o.provider_domain_id, '')), '') is not null
        )
      )
  ) then
    return 'order_active';
  end if;

  return null;
end;
$$;

revoke all on function public._admin_domain_import_conflict(text, uuid)
  from public, anon, authenticated;
grant execute on function public._admin_domain_import_conflict(text, uuid) to service_role;

comment on function public._admin_domain_import_conflict(text, uuid) is
  'Admin domain import collision rule: dead failed orders without registrar trace do not block; live/traced orders, custom_domains rows and other import requests do.';

-- Internal transaction: identical to 105 except the collision check.
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
  v_conflict text;
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

  v_conflict := public._admin_domain_import_conflict(v_request.domain, v_request.id);
  if v_conflict is not null then
    return jsonb_build_object('ok', false, 'code', v_conflict);
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

-- Identical to 105 except the collision check.
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
  v_requires_second_admin boolean;
  v_result jsonb;
  v_conflict text;
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

  v_conflict := public._admin_domain_import_conflict(v_domain, null);
  if v_conflict is not null then
    return jsonb_build_object('ok', false, 'code', v_conflict);
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

-- Identical to 105 except it re-runs the shared collision check before refreshing
-- the registrar snapshot, so a conflict that appeared after the request was filed
-- is reported with its specific code.
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
  v_conflict text;
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

  v_conflict := public._admin_domain_import_conflict(v_request.domain, v_request.id);
  if v_conflict is not null then
    return jsonb_build_object('ok', false, 'code', v_conflict);
  end if;

  update public.domain_import_requests
    set provider_domain_id = v_request.domain,
        expires_at = p_expires_at,
        registrar_nameservers = coalesce(p_registrar_nameservers, '{}'::text[])
    where id = v_request.id;

  return public._finalize_admin_domain_import(p_request_id, p_actor_user_id, v_actor_email);
end;
$$;

revoke all on function public._finalize_admin_domain_import(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_request_domain_import(text, text, uuid, text, uuid, text, text, text, text, timestamptz, text[], jsonb, text)
  from public, anon, authenticated;
revoke all on function public.admin_approve_domain_import(uuid, uuid, text, text, timestamptz, text[])
  from public, anon, authenticated;
grant execute on function public.admin_request_domain_import(text, text, uuid, text, uuid, text, text, text, text, timestamptz, text[], jsonb, text)
  to service_role;
grant execute on function public.admin_approve_domain_import(uuid, uuid, text, text, timestamptz, text[])
  to service_role;

-- Uniqueness on domain_orders.domain: the table DDL is not in this repository, so
-- discover it. A plain unique index/constraint over the domain alone would make the
-- insert of the new 'active' order fail because of a dead 'registration_failed' row.
-- Each such index/constraint is rebuilt as a partial unique index over the non-dead
-- statuses, with the same name and expression. No rows are touched. If nothing
-- matches (the expected case when there is no such unique), this block does nothing.
do $$
declare
  r record;
  v_expr text;
begin
  -- Unique indexes that are not backing a constraint, not partial, on the domain only.
  for r in
    select i.indexrelid, c.relname as index_name
      from pg_catalog.pg_index as i
      join pg_catalog.pg_class as c on c.oid = i.indexrelid
      where i.indrelid = 'public.domain_orders'::regclass
        and i.indisunique
        and not i.indisprimary
        and i.indpred is null
        and i.indnatts = 1
        and not exists (
          select 1 from pg_catalog.pg_constraint as k where k.conindid = i.indexrelid
        )
  loop
    v_expr := pg_catalog.pg_get_indexdef(r.indexrelid, 1, true);
    if v_expr ~* '^(lower\(|btrim\(|trim\(both from )*domain\)*$' then
      execute pg_catalog.format('drop index public.%I', r.index_name);
      execute pg_catalog.format(
        'create unique index %I on public.domain_orders (%s) where coalesce(status, '''') not in (''registration_failed'', ''failed'', ''cancelled'')',
        r.index_name, v_expr
      );
      raise notice '107: rebuilt unique index % as partial (live statuses only)', r.index_name;
    end if;
  end loop;

  -- Unique constraints over the domain alone.
  for r in
    select k.conname, k.conindid
      from pg_catalog.pg_constraint as k
      where k.conrelid = 'public.domain_orders'::regclass
        and k.contype = 'u'
        and pg_catalog.array_length(k.conkey, 1) = 1
        and k.conkey[1] = (
          select a.attnum from pg_catalog.pg_attribute as a
          where a.attrelid = 'public.domain_orders'::regclass and a.attname = 'domain'
        )
  loop
    execute pg_catalog.format('alter table public.domain_orders drop constraint %I', r.conname);
    execute pg_catalog.format(
      'create unique index %I on public.domain_orders (domain) where coalesce(status, '''') not in (''registration_failed'', ''failed'', ''cancelled'')',
      r.conname
    );
    raise notice '107: replaced unique constraint % with a partial unique index (live statuses only)', r.conname;
  end loop;
end $$;

-- Read-only verification after applying:
-- select pg_get_functiondef('public._admin_domain_import_conflict(text, uuid)'::regprocedure);
-- select indexdef from pg_indexes where schemaname = 'public' and tablename = 'domain_orders';
-- select status, count(*) from public.domain_orders group by status order by status;

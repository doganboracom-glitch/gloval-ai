-- scripts/086-domain-ownership-handover.sql
-- *** NOT APPLIED to any database. Review/PR only. ***
-- Hands a registrar (domainnameapi) domain over from one user to another.
-- Scope: custom_domains.order_id is set AND the linked domain_orders row is 'active'.
--        Transfer-in domains (order_id NULL) are out of scope.
-- Every handover/hold operation is ONE function call = ONE transaction. Functions are service_role only.
-- No registrar / Mailcow / Vercel call lives in this file; those are separate application steps.
-- Registrant / WHOIS data is NOT changed.
--
-- Giver waiver: handover_registrar_domain() refuses to run unless p_meta carries
--   giver_waiver_confirmed = true (JSON boolean) and giver_waiver_ticket (support ticket no).
--   The waiver and its ticket are written to the audit snapshot.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1) Quarantine flag ------------------------------------------------------------------
alter table public.custom_domains
  add column if not exists mail_transfer_hold_at timestamptz,
  add column if not exists mail_transfer_hold_handover_id uuid;

create index if not exists custom_domains_mail_hold_idx
  on public.custom_domains (mail_transfer_hold_at)
  where mail_transfer_hold_at is not null;

comment on column public.custom_domains.mail_transfer_hold_at is
  'Handover quarantine. When set, mailboxes MUST NOT be opened (sweep, getMyMailDomains, mailbox actions). Only release_domain_mail_transfer_hold() clears it.';

-- 2) Settings (single row): is a second admin required to release a quarantine? ----------
create table if not exists public.domain_handover_settings (
  id                   boolean primary key default true check (id),
  require_second_admin boolean not null default false,
  updated_at           timestamptz not null default now()
);
insert into public.domain_handover_settings (id, require_second_admin)
values (true, false)
on conflict (id) do nothing;

alter table public.domain_handover_settings enable row level security;   -- no policies
revoke all on public.domain_handover_settings from public, anon, authenticated;
grant select, update on public.domain_handover_settings to service_role;

-- 3) Audit table (append-only; no FKs so deleted users/domains never erase history) -----
create table if not exists public.domain_handover_events (
  id                uuid primary key default gen_random_uuid(),
  handover_id       uuid not null,
  event             text not null check (event in
                      ('handover','hosting_detached','release_requested','hold_released',
                       'reversed','notice_sent','notice_failed')),
  idempotency_key   text,
  custom_domain_id  uuid not null,
  domain            text not null,
  from_user_id      uuid,
  to_user_id        uuid,
  actor_email       text not null,
  reason            text,
  release_mode      text,
  consent_note      text,
  snapshot          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint dhe_release_mode_chk
    check (release_mode is null
           or release_mode in ('empty_handover','keep_mailboxes_with_consent')),
  constraint dhe_release_has_mode
    check (event not in ('hold_released','release_requested') or release_mode is not null),
  constraint dhe_consent_note_chk
    check (release_mode is distinct from 'keep_mailboxes_with_consent'
           or length(btrim(coalesce(consent_note, ''))) >= 10)
);

create unique index if not exists domain_handover_events_one_handover
  on public.domain_handover_events (handover_id) where event = 'handover';
create unique index if not exists domain_handover_events_one_release
  on public.domain_handover_events (handover_id) where event = 'hold_released';
create unique index if not exists domain_handover_events_idem
  on public.domain_handover_events (event, idempotency_key) where idempotency_key is not null;
create index if not exists domain_handover_events_domain_idx
  on public.domain_handover_events (custom_domain_id, created_at desc);
create index if not exists domain_handover_events_handover_idx
  on public.domain_handover_events (handover_id, created_at desc);

alter table public.domain_handover_events enable row level security;      -- no policies
revoke all on public.domain_handover_events from public, anon, authenticated;
grant select on public.domain_handover_events to service_role;

create or replace function public.dhe_block_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'domain_handover_events is append-only' using errcode = '42501';
end $$;

drop trigger if exists dhe_no_update_delete on public.domain_handover_events;
create trigger dhe_no_update_delete before update or delete on public.domain_handover_events
  for each row execute function public.dhe_block_mutation();
drop trigger if exists dhe_no_truncate on public.domain_handover_events;
create trigger dhe_no_truncate before truncate on public.domain_handover_events
  for each statement execute function public.dhe_block_mutation();

-- 4) Quarantine guard trigger (second lock against application bugs) ---------------------
create or replace function public.custom_domains_mail_hold_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.mail_transfer_hold_at is not null then
    new.email_enabled := false;
    new.mail_access_status := 'suspended';
  end if;
  if old.mail_transfer_hold_at is not null and new.mail_transfer_hold_at is null
     and coalesce(current_setting('app.domain_hold_release', true), '') <> 'on' then
    raise exception 'mail_transfer_hold_release_forbidden' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists custom_domains_mail_hold_guard on public.custom_domains;
create trigger custom_domains_mail_hold_guard before update on public.custom_domains
  for each row execute function public.custom_domains_mail_hold_guard();

-- 5) Internal helper: a user without a primary gets their OLDEST domain as primary --------
--    (status = 'active' first, then created_at, then id)
create or replace function public._ensure_user_primary(p_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pick uuid;
begin
  if exists (select 1 from public.custom_domains where user_id = p_user_id and is_primary) then
    return null;
  end if;
  select id into v_pick from public.custom_domains
   where user_id = p_user_id
   order by (status = 'active') desc, created_at asc, id asc
   limit 1
   for update;
  if v_pick is null then return null; end if;
  update public.custom_domains set is_primary = true where id = v_pick;
  return v_pick;
end $$;

-- 6) HANDOVER ---------------------------------------------------------------------------
create or replace function public.handover_registrar_domain(
  p_custom_domain_id      uuid,
  p_expected_from_user_id uuid,
  p_to_user_id            uuid,
  p_to_email              text,
  p_actor_email           text,
  p_reason                text,
  p_idempotency_key       text,
  p_meta                  jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_dom          public.custom_domains%rowtype;
  v_order        public.domain_orders%rowtype;
  v_prev         public.domain_handover_events%rowtype;
  v_u            auth.users%rowtype;
  v_id           uuid := gen_random_uuid();
  v_open_o       int;
  v_open_t       int;
  v_open_r       int;
  v_old_promoted uuid;
  v_new_promoted uuid;
  v_before       jsonb;
  v_waiver       jsonb;
  v_ticket       text;
  v_result       jsonb;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' or length(p_idempotency_key) > 80
     or coalesce(btrim(p_actor_email), '') = ''
     or length(coalesce(btrim(p_reason), '')) < 10 then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;

  -- Serialises concurrent calls for the same domain.
  perform pg_advisory_xact_lock(hashtextextended('handover:' || p_custom_domain_id::text, 0));

  -- Idempotency: same key + same parameters returns the recorded result untouched.
  select * into v_prev from public.domain_handover_events
   where event = 'handover' and idempotency_key = p_idempotency_key;
  if found then
    if v_prev.custom_domain_id = p_custom_domain_id and v_prev.to_user_id = p_to_user_id then
      return v_prev.snapshot || jsonb_build_object('ok', true, 'replayed', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'idempotency_key_reuse');
  end if;

  -- Giver waiver: the giving side declared in writing that it backed up its own data and
  -- will make no claim on the domain after the handover. Required for EVERY new handover.
  if p_meta is null or jsonb_typeof(p_meta) <> 'object'
     or (p_meta -> 'giver_waiver_confirmed') is distinct from 'true'::jsonb then
    return jsonb_build_object('ok', false, 'code', 'giver_waiver_required');
  end if;
  v_ticket := btrim(coalesce(p_meta ->> 'giver_waiver_ticket', ''));
  if length(v_ticket) < 3 or length(v_ticket) > 64 then
    return jsonb_build_object('ok', false, 'code', 'giver_waiver_ticket_required');
  end if;

  select * into v_dom from public.custom_domains where id = p_custom_domain_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'domain_not_found');
  end if;

  if v_dom.user_id = p_to_user_id then
    return jsonb_build_object('ok', false, 'code', 'already_owned_by_target');
  end if;
  if v_dom.user_id <> p_expected_from_user_id then
    return jsonb_build_object('ok', false, 'code', 'owner_changed');
  end if;

  -- Target user: exists, not deleted, e-mail matches, confirmed, not banned.
  select * into v_u from auth.users where id = p_to_user_id;
  if not found or v_u.deleted_at is not null then
    return jsonb_build_object('ok', false, 'code', 'target_not_found');
  end if;
  if lower(btrim(coalesce(v_u.email, ''))) <> lower(btrim(coalesce(p_to_email, ''))) then
    return jsonb_build_object('ok', false, 'code', 'target_email_mismatch');
  end if;
  if v_u.email_confirmed_at is null then
    return jsonb_build_object('ok', false, 'code', 'target_unconfirmed');
  end if;
  if v_u.banned_until is not null and v_u.banned_until > now() then
    return jsonb_build_object('ok', false, 'code', 'target_banned');
  end if;

  -- Domain preconditions.
  if v_dom.provider <> 'domainnameapi' then
    return jsonb_build_object('ok', false, 'code', 'not_registrar_domain');
  end if;
  if v_dom.order_id is null then
    return jsonb_build_object('ok', false, 'code', 'no_order');
  end if;
  if v_dom.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'domain_not_active');
  end if;
  if v_dom.expires_at is not null and v_dom.expires_at < now() then
    return jsonb_build_object('ok', false, 'code', 'domain_expired');
  end if;

  select * into v_order from public.domain_orders where id = v_dom.order_id for update;
  if not found or v_order.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'order_not_active');
  end if;
  if lower(btrim(v_order.domain)) <> v_dom.domain then
    return jsonb_build_object('ok', false, 'code', 'order_domain_mismatch');
  end if;
  if v_order.user_id is not null and v_order.user_id <> v_dom.user_id then
    return jsonb_build_object('ok', false, 'code', 'order_owner_mismatch');
  end if;

  -- Open jobs for the same domain, regardless of user. Anything outside the terminal
  -- statuses (verified against the live CHECK constraints) counts as open; a
  -- pending_payment older than 2 hours is treated as abandoned.
  select count(*) into v_open_o from public.domain_orders o
   where lower(btrim(o.domain)) = v_dom.domain
     and o.id <> v_dom.order_id
     and o.status not in ('active','registration_failed','failed','cancelled')
     and not (o.status = 'pending_payment' and o.created_at <= now() - interval '2 hours');

  select count(*) into v_open_t from public.domain_transfers t
   where lower(btrim(t.domain)) = v_dom.domain
     and t.status not in ('completed','failed','cancelled')
     and not (t.status = 'pending_payment' and t.created_at <= now() - interval '2 hours');

  select count(*) into v_open_r from public.domain_renewals r
   where lower(btrim(r.domain)) = v_dom.domain
     and r.status not in ('completed','failed','cancelled')
     and not (r.status = 'pending_payment' and r.created_at <= now() - interval '2 hours');

  if v_open_o + v_open_t + v_open_r > 0 then
    return jsonb_build_object('ok', false, 'code', 'open_job',
      'open_orders', v_open_o, 'open_transfers', v_open_t, 'open_renewals', v_open_r);
  end if;

  -- "Before" photo for reversal.
  v_before := jsonb_build_object(
    'is_primary',            v_dom.is_primary,
    'website_project_id',    v_dom.website_project_id,
    'email_enabled',         v_dom.email_enabled,
    'mail_access_status',    v_dom.mail_access_status,
    'mail_grace_started_at', v_dom.mail_grace_started_at,
    'mail_grace_ends_at',    v_dom.mail_grace_ends_at,
    'mail_quota_mb_per_box', v_dom.mail_quota_mb_per_box,
    'vercel_status',         v_dom.vercel_status);

  v_waiver := jsonb_build_object(
    'confirmed',    true,
    'ticket',       v_ticket,
    'confirmed_by', btrim(p_actor_email),
    'confirmed_at', now());

  -- One UPDATE. is_primary drops first so the one-primary-per-user index cannot collide.
  update public.custom_domains set
    user_id                        = p_to_user_id,
    is_primary                     = false,
    website_project_id             = null,
    email_enabled                  = false,
    mail_quota_mb_per_box          = null,
    mail_access_status             = 'suspended',
    mail_grace_started_at          = null,
    mail_grace_ends_at             = null,
    mail_access_sync_pending       = true,
    mail_access_sync_error         = null,
    mail_transfer_hold_at          = now(),
    mail_transfer_hold_handover_id = v_id
  where id = v_dom.id;

  v_old_promoted := public._ensure_user_primary(v_dom.user_id);
  v_new_promoted := public._ensure_user_primary(p_to_user_id);

  v_result := jsonb_build_object(
    'handover_id',           v_id,
    'custom_domain_id',      v_dom.id,
    'domain',                v_dom.domain,
    'from_user_id',          v_dom.user_id,
    'to_user_id',            p_to_user_id,
    'order_id',              v_dom.order_id,
    'before',                v_before,
    'old_owner_promoted_id', v_old_promoted,
    'new_owner_promoted_id', v_new_promoted,
    'giver_waiver',          v_waiver,
    'meta',                  coalesce(p_meta, '{}'::jsonb) - 'giver_waiver_confirmed' - 'giver_waiver_ticket');

  insert into public.domain_handover_events
    (id, handover_id, event, idempotency_key, custom_domain_id, domain,
     from_user_id, to_user_id, actor_email, reason, snapshot)
  values
    (v_id, v_id, 'handover', p_idempotency_key, v_dom.id, v_dom.domain,
     v_dom.user_id, p_to_user_id, btrim(p_actor_email), btrim(p_reason), v_result);

  return v_result || jsonb_build_object('ok', true, 'replayed', false);
end $$;

-- 7) RELEASE REQUEST (only needed while require_second_admin = true) --------------------
create or replace function public.request_domain_mail_hold_release(
  p_custom_domain_id uuid,
  p_handover_id      uuid,
  p_actor_email      text,
  p_release_mode     text,
  p_consent_note     text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_dom  public.custom_domains%rowtype;
  v_h    public.domain_handover_events%rowtype;
  v_note text := btrim(coalesce(p_consent_note, ''));
begin
  if coalesce(btrim(p_actor_email), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;
  if p_release_mode is null or p_release_mode not in ('empty_handover','keep_mailboxes_with_consent') then
    return jsonb_build_object('ok', false, 'code', 'bad_release_mode');
  end if;
  if p_release_mode = 'keep_mailboxes_with_consent' and length(v_note) < 10 then
    return jsonb_build_object('ok', false, 'code', 'consent_note_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('handover:' || p_custom_domain_id::text, 0));

  select * into v_dom from public.custom_domains where id = p_custom_domain_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'domain_not_found'); end if;
  if v_dom.mail_transfer_hold_at is null then return jsonb_build_object('ok', false, 'code', 'not_held'); end if;
  if v_dom.mail_transfer_hold_handover_id is distinct from p_handover_id then
    return jsonb_build_object('ok', false, 'code', 'handover_mismatch');
  end if;

  select * into v_h from public.domain_handover_events
   where handover_id = p_handover_id and event = 'handover';
  if not found then return jsonb_build_object('ok', false, 'code', 'handover_not_found'); end if;

  insert into public.domain_handover_events
    (handover_id, event, custom_domain_id, domain, from_user_id, to_user_id,
     actor_email, reason, release_mode, consent_note, snapshot)
  values
    (p_handover_id, 'release_requested', v_dom.id, v_dom.domain, v_h.from_user_id, v_dom.user_id,
     btrim(p_actor_email), 'release_requested:' || p_release_mode, p_release_mode,
     case when p_release_mode = 'keep_mailboxes_with_consent' then v_note else null end,
     jsonb_build_object('handover_id', p_handover_id, 'release_mode', p_release_mode));

  return jsonb_build_object('ok', true, 'handover_id', p_handover_id, 'release_mode', p_release_mode);
end $$;

-- 8) RELEASE: separate, explicitly confirmed, two modes -----------------------------------
--   empty_handover (DEFAULT): mailboxes were deleted from Mailcow by hand; the count is 0 and fresh.
--   keep_mailboxes_with_consent (EXCEPTION): admin note (>= 10 chars) carrying the previous owner's written consent.
create or replace function public.release_domain_mail_transfer_hold(
  p_custom_domain_id uuid,
  p_handover_id      uuid,
  p_actor_email      text,
  p_confirm_domain   text,
  p_ack              boolean,
  p_release_mode     text,
  p_consent_note     text,
  p_idempotency_key  text,
  p_meta             jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_dom     public.custom_domains%rowtype;
  v_prev    public.domain_handover_events%rowtype;
  v_h       public.domain_handover_events%rowtype;
  v_req     public.domain_handover_events%rowtype;
  v_second  boolean;
  v_count   text;
  v_checked timestamptz;
  v_note    text := btrim(coalesce(p_consent_note, ''));
begin
  if coalesce(btrim(p_idempotency_key), '') = '' or length(p_idempotency_key) > 80
     or coalesce(btrim(p_actor_email), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;
  if p_release_mode is null or p_release_mode not in ('empty_handover','keep_mailboxes_with_consent') then
    return jsonb_build_object('ok', false, 'code', 'bad_release_mode');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('handover:' || p_custom_domain_id::text, 0));

  select * into v_prev from public.domain_handover_events
   where event = 'hold_released' and idempotency_key = p_idempotency_key;
  if found then
    if v_prev.handover_id = p_handover_id then
      return v_prev.snapshot || jsonb_build_object('ok', true, 'replayed', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'idempotency_key_reuse');
  end if;

  select * into v_dom from public.custom_domains where id = p_custom_domain_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'domain_not_found'); end if;
  if v_dom.mail_transfer_hold_at is null then return jsonb_build_object('ok', false, 'code', 'not_held'); end if;
  if v_dom.mail_transfer_hold_handover_id is distinct from p_handover_id then
    return jsonb_build_object('ok', false, 'code', 'handover_mismatch');
  end if;
  if lower(btrim(coalesce(p_confirm_domain, ''))) <> v_dom.domain then
    return jsonb_build_object('ok', false, 'code', 'confirm_mismatch');
  end if;
  if p_ack is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'ack_required');
  end if;

  select * into v_h from public.domain_handover_events
   where handover_id = p_handover_id and event = 'handover';
  if not found then return jsonb_build_object('ok', false, 'code', 'handover_not_found'); end if;

  if p_release_mode = 'empty_handover' then
    -- The application reads Mailcow LIVE and reports it in p_meta; the database enforces the rule.
    v_count := p_meta ->> 'mailbox_count';
    if v_count is null or v_count !~ '^[0-9]{1,9}$' then
      return jsonb_build_object('ok', false, 'code', 'mailbox_count_unknown');
    end if;
    if v_count::int <> 0 then
      return jsonb_build_object('ok', false, 'code', 'mailboxes_not_cleared',
                                'mailbox_count', v_count::int);
    end if;
    begin
      v_checked := (p_meta ->> 'mailbox_count_checked_at')::timestamptz;
    exception when others then
      v_checked := null;
    end;
    if v_checked is null
       or v_checked < now() - interval '10 minutes'
       or v_checked > now() + interval '1 minute' then
      return jsonb_build_object('ok', false, 'code', 'mailbox_count_stale');
    end if;
  else
    if length(v_note) < 10 then
      return jsonb_build_object('ok', false, 'code', 'consent_note_required');
    end if;
  end if;

  -- Optional second admin (default OFF). A missing settings row fails closed = required.
  select require_second_admin into v_second from public.domain_handover_settings where id;
  if coalesce(v_second, true) then
    select * into v_req from public.domain_handover_events
     where handover_id = p_handover_id and event = 'release_requested'
     order by created_at desc, id desc limit 1;
    if not found or v_req.created_at < now() - interval '24 hours' then
      return jsonb_build_object('ok', false, 'code', 'second_admin_required');
    end if;
    if lower(btrim(v_req.actor_email)) = lower(btrim(p_actor_email)) then
      return jsonb_build_object('ok', false, 'code', 'second_admin_same_person');
    end if;
    if v_req.release_mode is distinct from p_release_mode
       or (p_release_mode = 'keep_mailboxes_with_consent'
           and btrim(coalesce(v_req.consent_note, '')) <> v_note) then
      return jsonb_build_object('ok', false, 'code', 'request_mismatch');
    end if;
  end if;

  perform set_config('app.domain_hold_release', 'on', true);   -- this transaction only
  update public.custom_domains set
    mail_transfer_hold_at          = null,
    mail_transfer_hold_handover_id = null,
    mail_access_sync_pending       = true     -- the sweep recomputes from the new owner's real entitlement
  where id = v_dom.id;

  insert into public.domain_handover_events
    (handover_id, event, idempotency_key, custom_domain_id, domain, from_user_id, to_user_id,
     actor_email, reason, release_mode, consent_note, snapshot)
  values
    (p_handover_id, 'hold_released', p_idempotency_key, v_dom.id, v_dom.domain,
     v_h.from_user_id, v_dom.user_id, btrim(p_actor_email),
     'hold_release:' || p_release_mode, p_release_mode,
     case when p_release_mode = 'keep_mailboxes_with_consent' then v_note else null end,
     jsonb_build_object(
       'handover_id', p_handover_id, 'custom_domain_id', v_dom.id, 'domain', v_dom.domain,
       'release_mode', p_release_mode, 'second_admin_used', coalesce(v_second, true),
       'second_admin_requested_by', v_req.actor_email,
       'meta', coalesce(p_meta, '{}'::jsonb)));

  return jsonb_build_object('ok', true, 'replayed', false, 'handover_id', p_handover_id,
                            'domain', v_dom.domain, 'release_mode', p_release_mode);
end $$;

-- 9) Extra audit entries (hosting_detached / notice_sent / notice_failed) -----------------
create or replace function public.log_domain_handover_event(
  p_handover_id uuid,
  p_event       text,
  p_actor_email text,
  p_meta        jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_h public.domain_handover_events%rowtype;
begin
  if p_event not in ('hosting_detached','notice_sent','notice_failed') then
    raise exception 'event_not_allowed';
  end if;
  select * into v_h from public.domain_handover_events
   where handover_id = p_handover_id and event = 'handover';
  if not found then raise exception 'handover_not_found'; end if;
  insert into public.domain_handover_events
    (handover_id, event, custom_domain_id, domain, from_user_id, to_user_id, actor_email, snapshot)
  values
    (p_handover_id, p_event, v_h.custom_domain_id, v_h.domain, v_h.from_user_id, v_h.to_user_id,
     coalesce(nullif(btrim(p_actor_email), ''), 'system'), coalesce(p_meta, '{}'::jsonb));
end $$;

-- 10) Grants: service_role only ---------------------------------------------------------
revoke all on function public.handover_registrar_domain(uuid,uuid,uuid,text,text,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.request_domain_mail_hold_release(uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.release_domain_mail_transfer_hold(uuid,uuid,text,text,boolean,text,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.log_domain_handover_event(uuid,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public._ensure_user_primary(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.handover_registrar_domain(uuid,uuid,uuid,text,text,text,text,jsonb) to service_role;
grant execute on function public.request_domain_mail_hold_release(uuid,uuid,text,text,text) to service_role;
grant execute on function public.release_domain_mail_transfer_hold(uuid,uuid,text,text,boolean,text,text,text,jsonb) to service_role;
grant execute on function public.log_domain_handover_event(uuid,text,text,jsonb) to service_role;

commit;

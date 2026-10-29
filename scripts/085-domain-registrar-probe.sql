-- scripts/085-domain-registrar-probe.sql
-- PR 0 registrar verification endpoint: two server-only tables.
--   domain_registrar_probe_runs   one admin-started test run per domain/contact type
--   domain_registrar_probe_events append-only audit/observation log (no PII)
-- Rules enforced here (not only in code):
--   * registrant runs need registrant_confirmed = true AND a written approval note
--   * the encrypted contact-set backup lives at most 24 hours (7 days for registrant runs,
--     because registrar e-mail approvals are asynchronous and can take days)
--   * a run cannot enter 'change_submitted' without a stored backup
--   * one active run per domain
--   * read-backs after submission: technical/administrative/billing at +1h, +6h, +24h, +48h (4);
--     registrant additionally +72h, +96h (6). The offsets live in code, the cap lives here.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1) Runs -----------------------------------------------------------------------------
create table public.domain_registrar_probe_runs (
  id                         uuid primary key default gen_random_uuid(),
  domain                     text not null,
  contact_type               text not null,
  status                     text not null default 'created',
  started_by                 uuid references auth.users(id) on delete set null,

  registrant_confirmed       boolean not null default false,
  registrant_approval_note   text,

  test_contact_email_masked  text,
  backup_enc                 text,
  backup_saved_at            timestamptz,
  backup_expires_at          timestamptz,
  backup_purged_at           timestamptz,

  submitted_at               timestamptz,
  readbacks_done             smallint not null default 0,
  next_readback_at           timestamptz,
  readback_lease_until       timestamptz,

  registrar_cancelable       boolean,
  error_code                 text,
  note                       text,

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  finished_at                timestamptz,

  constraint drp_domain_normalized check (
    domain = lower(btrim(domain))
    and domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$'),
  constraint drp_contact_type check (contact_type in ('technical','administrative','billing','registrant')),
  constraint drp_status check (status in (
    'created','backup_saved','change_submitted','restoring','restored','restore_failed',
    'observing','completed','aborted','failed')),
  constraint drp_registrant_gate check (
    contact_type <> 'registrant'
    or (registrant_confirmed and coalesce(char_length(btrim(registrant_approval_note)), 0) >= 10)),
  constraint drp_backup_window check (
    backup_enc is null
    or (backup_saved_at is not null
        and backup_expires_at is not null
        and backup_expires_at > backup_saved_at
        and backup_expires_at <= backup_saved_at
            + case when contact_type = 'registrant' then interval '7 days' else interval '24 hours' end)),
  constraint drp_purged_means_empty check (backup_purged_at is null or backup_enc is null),
  constraint drp_backup_after_created check (
    status in ('created','aborted','failed') or backup_saved_at is not null),
  constraint drp_readbacks_range check (
    readbacks_done between 0 and (case when contact_type = 'registrant' then 6 else 4 end)),
  constraint drp_note_len check (note is null or char_length(note) <= 1000)
);

create unique index drp_one_active_per_domain on public.domain_registrar_probe_runs (domain)
  where status in ('created','backup_saved','change_submitted','restoring','restored','restore_failed','observing');
create index drp_due_idx on public.domain_registrar_probe_runs (next_readback_at)
  where status in ('change_submitted','restored','observing') and readbacks_done < 6;
create index drp_backup_expiry_idx on public.domain_registrar_probe_runs (backup_expires_at)
  where backup_enc is not null;

create function public.drp_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare ok boolean;
begin
  if new.domain <> old.domain
     or new.contact_type <> old.contact_type
     or new.registrant_confirmed <> old.registrant_confirmed
     or new.registrant_approval_note is distinct from old.registrant_approval_note
     or new.created_at <> old.created_at then
    raise exception 'immutable_column' using errcode = '23514';
  end if;

  if new.status <> old.status then
    ok := case old.status
      when 'created'          then new.status in ('backup_saved','aborted','failed')
      when 'backup_saved'     then new.status in ('change_submitted','aborted','failed')
      when 'change_submitted' then new.status in ('restoring','observing','failed')
      when 'restoring'        then new.status in ('restored','restore_failed')
      when 'restored'         then new.status in ('observing','completed')
      when 'restore_failed'   then new.status in ('restoring','aborted')
      when 'observing'        then new.status in ('restoring','completed','failed')
      else false end;
    if not ok then
      raise exception 'illegal_transition % -> %', old.status, new.status using errcode = '23514';
    end if;
    if new.status = 'change_submitted' and new.backup_enc is null then
      raise exception 'backup_required' using errcode = '23514';
    end if;
    if new.status = 'change_submitted' and new.submitted_at is null then
      new.submitted_at := now();
    end if;
  end if;

  if new.status in ('completed','aborted','failed') and new.finished_at is null then
    new.finished_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger drp_before_update before update on public.domain_registrar_probe_runs
  for each row execute function public.drp_before_update();

alter table public.domain_registrar_probe_runs enable row level security;
revoke all on table public.domain_registrar_probe_runs from anon, authenticated, service_role;
grant select, insert, update on table public.domain_registrar_probe_runs to service_role;

-- 2) Events (append-only, no PII) ----------------------------------------------------
create table public.domain_registrar_probe_events (
  id                  bigint generated always as identity primary key,
  run_id              uuid not null references public.domain_registrar_probe_runs(id) on delete restrict,
  event               text not null,
  phase               text,
  api_operation       text,
  api_status          text,
  duration_ms         integer,
  contact_fingerprint text,
  actor_id            uuid,
  meta                jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  constraint dre_fingerprint_hex check (contact_fingerprint is null or contact_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint dre_duration_nonneg check (duration_ms is null or duration_ms >= 0),
  constraint dre_phase check (phase is null or phase in (
    'backup','submit','immediate_readback','restore',
    'readback_1h','readback_6h','readback_24h','readback_48h','readback_72h','readback_96h','manual')),
  constraint dre_meta_no_pii check (
    not (meta ?| array['email','to_email','from_email','contact','phone','address','name','token','auth_code','ip','backup']))
);
create index dre_run_idx on public.domain_registrar_probe_events (run_id, created_at);

create function public.dre_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'domain_registrar_probe_events is append-only';
end $$;

create trigger dre_no_change   before update or delete on public.domain_registrar_probe_events
  for each row       execute function public.dre_block_mutation();
create trigger dre_no_truncate before truncate on public.domain_registrar_probe_events
  for each statement execute function public.dre_block_mutation();

alter table public.domain_registrar_probe_events enable row level security;
revoke all on table public.domain_registrar_probe_events from anon, authenticated, service_role;
grant select, insert on table public.domain_registrar_probe_events to service_role;
revoke all on sequence public.domain_registrar_probe_events_id_seq from anon, authenticated;
grant usage on sequence public.domain_registrar_probe_events_id_seq to service_role;

-- 3) Functions (server-side only) ----------------------------------------------------
create function public.claim_due_registrar_probe_readbacks(p_limit integer default 5)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select id from public.domain_registrar_probe_runs
     where status in ('change_submitted','restored','observing')
       and readbacks_done < (case when contact_type = 'registrant' then 6 else 4 end)
       and next_readback_at <= now()
       and (readback_lease_until is null or readback_lease_until <= now())
     order by next_readback_at
     limit greatest(p_limit, 1)
     for update skip locked)
  update public.domain_registrar_probe_runs r
     set readback_lease_until = now() + interval '5 minutes'
    from due where r.id = due.id
  returning r.id;
end $$;

create function public.purge_registrar_probe_backups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  update public.domain_registrar_probe_runs
     set backup_enc = null, backup_purged_at = now()
   where backup_enc is not null and backup_expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.claim_due_registrar_probe_readbacks(integer) from public, anon, authenticated;
revoke all on function public.purge_registrar_probe_backups()               from public, anon, authenticated;
revoke all on function public.drp_before_update()                           from public, anon, authenticated;
revoke all on function public.dre_block_mutation()                          from public, anon, authenticated;
grant execute on function public.claim_due_registrar_probe_readbacks(integer) to service_role;
grant execute on function public.purge_registrar_probe_backups()               to service_role;

commit;

-- ============================================================================
-- Read-only verification after applying (expected results):
-- 1) select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
--      from information_schema.role_table_grants
--     where table_schema='public' and table_name like 'domain_registrar_probe_%'
--       and grantee in ('anon','authenticated','service_role')
--     group by 1,2 order by 1,2;
--    -- runs: service_role INSERT,SELECT,UPDATE ; events: service_role INSERT,SELECT ; no anon/authenticated rows
-- 2) select c.relname, c.relrowsecurity,
--           (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies
--      from pg_class c join pg_namespace n on n.oid=c.relnamespace
--     where n.nspname='public' and c.relname like 'domain_registrar_probe_%' and c.relkind='r';
--    -- both rls = true, policies = 0
-- 3) select p.proname, p.proconfig,
--           has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--           has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
--           has_function_privilege('service_role', p.oid, 'execute') as svc_exec
--      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' and p.proname in (
--       'drp_before_update','dre_block_mutation','claim_due_registrar_probe_readbacks','purge_registrar_probe_backups');
--    -- all four pin search_path; anon/auth false; service_role true for the two callable ones
-- ============================================================================

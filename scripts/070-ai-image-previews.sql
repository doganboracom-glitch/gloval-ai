-- 070-ai-image-previews.sql
-- v3: approved by the owner with conditions (signature check, rollback tests).
--
-- Server-side preview sessions for "AI ile üret" images, plus the ONE-TIME free
-- preview per ACCOUNT. Every money/entitlement decision happens inside a
-- SECURITY DEFINER function, in ONE transaction, serialized per user with the
-- same advisory lock the existing `consume_ai_credits` uses
-- (pg_advisory_xact_lock(hashtext(user_id::text))). Credits are charged by
-- calling that existing function, so the ledger stays the single source of truth.

begin;

-- 1) Free preview: ONE row per account. PRIMARY KEY (user_id) is the guarantee:
--    two concurrent requests can never both insert it.
create table if not exists public.ai_preview_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  free_preview_id uuid,
  free_preview_used_at timestamptz not null default now()
);

-- 2) Preview sessions.
create table if not exists public.ai_image_previews (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  section_key text not null,
  target text not null default 'about' check (target in ('about', 'services', 'gallery')),
  status text not null default 'generating'
    check (status in ('generating', 'open', 'regenerating', 'used', 'discarded', 'expired')),
  kind text check (kind in ('free', 'paid')),
  image_url text,
  storage_path text,
  alt text,
  image_prompt text,
  charged_credits integer not null default 0 check (charged_credits >= 0),
  regen_count integer not null default 0 check (regen_count >= 0),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  used_at timestamptz,
  constraint ai_image_previews_open_has_image
    check (status not in ('open', 'regenerating', 'used') or (image_url is not null and kind is not null))
);

-- At most ONE live preview per account + site + section (double click = one preview).
create unique index if not exists ai_image_previews_one_live
  on public.ai_image_previews (user_id, project_id, section_key)
  where status in ('generating', 'open', 'regenerating');

create index if not exists ai_image_previews_sweep
  on public.ai_image_previews (status, expires_at);

-- 3) Idempotency ledger for preview operations. UNIQUE (user_id, idem_key):
--    the same create / regenerate / use request can be applied only once.
create table if not exists public.ai_preview_ops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  preview_id uuid not null references public.ai_image_previews (id) on delete cascade,
  op text not null check (op in ('create', 'regen', 'use')),
  idem_key text not null,
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now(),
  constraint ai_preview_ops_idem_unique unique (user_id, idem_key)
);

-- 4) Lock the tables down. RLS on with NO policies = deny for anon/authenticated;
--    service_role bypasses RLS. Table privileges are removed as well, so even a
--    future permissive policy cannot expose or let clients write these tables.
alter table public.ai_preview_entitlements enable row level security;
alter table public.ai_image_previews enable row level security;
alter table public.ai_preview_ops enable row level security;

revoke all on public.ai_preview_entitlements from public, anon, authenticated;
revoke all on public.ai_image_previews from public, anon, authenticated;
revoke all on public.ai_preview_ops from public, anon, authenticated;
grant select, insert, update, delete on public.ai_preview_entitlements to service_role;
grant select, insert, update, delete on public.ai_image_previews to service_role;
grant select, insert, update, delete on public.ai_preview_ops to service_role;

-- 5) RPCs. All SECURITY DEFINER, search_path pinned, executable by service_role only.

-- 5a) Claim the single live slot for a section (and expire dead rows first).
create or replace function public.ai_preview_claim_slot(
  p_user uuid, p_id uuid, p_project uuid, p_section text, p_target text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  update public.ai_image_previews
     set status = 'expired', updated_at = now()
   where user_id = p_user and project_id = p_project and section_key = p_section
     and ((status in ('open', 'generating', 'regenerating') and expires_at < now())
       or (status = 'generating' and updated_at < now() - interval '3 minutes'));

  update public.ai_image_previews
     set status = 'open', updated_at = now()
   where user_id = p_user and project_id = p_project and section_key = p_section
     and status = 'regenerating' and updated_at < now() - interval '3 minutes';

  insert into public.ai_image_previews (id, user_id, project_id, section_key, target)
  values (p_id, p_user, p_project, p_section, p_target)
  on conflict (user_id, project_id, section_key)
    where status in ('generating', 'open', 'regenerating')
  do nothing;
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;

-- 5b) The image exists: consume the free preview OR charge 2 credits, atomically.
--     Free entitlement + credit charge + row update + idempotency record are one
--     transaction: any exception rolls ALL of it back.
create or replace function public.ai_preview_commit_create(
  p_user uuid, p_id uuid, p_url text, p_path text, p_alt text, p_prompt text
) returns table (o_outcome text, o_kind text, o_charged integer, o_balance integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.ai_image_previews;
  v_key text := 'create:' || p_id::text;
  v_n integer;
  v_ok boolean;
  v_bal integer;
  v_kind text;
  v_charged integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select * into v_row from public.ai_image_previews where id = p_id and user_id = p_user for update;
  if not found then
    return query select 'invalid'::text, null::text, 0, null::integer; return;
  end if;
  if exists (select 1 from public.ai_preview_ops where user_id = p_user and idem_key = v_key) then
    return query select 'replay'::text, v_row.kind, v_row.charged_credits, null::integer; return;
  end if;
  if v_row.status <> 'generating' then
    return query select 'invalid'::text, null::text, 0, null::integer; return;
  end if;

  insert into public.ai_preview_entitlements (user_id, free_preview_id)
  values (p_user, p_id)
  on conflict (user_id) do nothing;
  get diagnostics v_n = row_count;

  if v_n = 1 then
    v_kind := 'free';
  else
    select c.ok, c.balance into v_ok, v_bal
      from public.consume_ai_credits(p_user, 2, 'ai-preview-new:' || p_id::text) c;
    if not v_ok then
      return query select 'no_credits'::text, null::text, 0, v_bal; return;
    end if;
    v_kind := 'paid';
    v_charged := 2;
  end if;

  update public.ai_image_previews
     set status = 'open', kind = v_kind, image_url = p_url, storage_path = p_path,
         alt = p_alt, image_prompt = p_prompt, charged_credits = v_charged,
         expires_at = now() + interval '30 minutes', updated_at = now()
   where id = p_id;

  insert into public.ai_preview_ops (user_id, preview_id, op, idem_key, credits)
  values (p_user, p_id, 'create', v_key, v_charged);

  return query select 'ok'::text, v_kind, v_charged, v_bal;
end $$;

-- 5c) Regenerate, phase 1: take the row (no charge). Same key twice = 'duplicate'.
create or replace function public.ai_preview_claim_regen(p_user uuid, p_id uuid, p_key text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.ai_image_previews;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select * into v_row from public.ai_image_previews where id = p_id and user_id = p_user for update;
  if not found then return 'invalid'; end if;
  if exists (select 1 from public.ai_preview_ops
              where user_id = p_user and idem_key = 'regen:' || p_id::text || ':' || p_key) then
    return 'duplicate';
  end if;
  if v_row.status = 'regenerating' and v_row.updated_at < now() - interval '3 minutes' then
    v_row.status := 'open';
  end if;
  if v_row.status in ('generating', 'regenerating') then return 'inflight'; end if;
  if v_row.status <> 'open' or v_row.expires_at <= now() then return 'invalid'; end if;
  update public.ai_image_previews set status = 'regenerating', updated_at = now() where id = p_id;
  return 'claimed';
end $$;

-- 5d) Regenerate, phase 2: the new image exists -> charge 1 + swap image, atomically.
create or replace function public.ai_preview_commit_regen(
  p_user uuid, p_id uuid, p_key text, p_url text, p_path text, p_alt text, p_prompt text
) returns table (o_outcome text, o_old_path text, o_balance integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.ai_image_previews;
  v_key text := 'regen:' || p_id::text || ':' || p_key;
  v_ok boolean;
  v_bal integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select * into v_row from public.ai_image_previews where id = p_id and user_id = p_user for update;
  if not found then
    return query select 'invalid'::text, null::text, null::integer; return;
  end if;
  if exists (select 1 from public.ai_preview_ops where user_id = p_user and idem_key = v_key) then
    return query select 'replay'::text, null::text, null::integer; return;
  end if;
  if v_row.status <> 'regenerating' then
    return query select 'invalid'::text, null::text, null::integer; return;
  end if;

  select c.ok, c.balance into v_ok, v_bal
    from public.consume_ai_credits(p_user, 1, 'ai-preview-regen:' || p_id::text || ':' || p_key) c;
  if not v_ok then
    update public.ai_image_previews set status = 'open', updated_at = now() where id = p_id;
    return query select 'no_credits'::text, null::text, v_bal; return;
  end if;

  update public.ai_image_previews
     set status = 'open', image_url = p_url, storage_path = p_path, alt = p_alt,
         image_prompt = p_prompt, regen_count = regen_count + 1,
         charged_credits = charged_credits + 1,
         expires_at = now() + interval '30 minutes', updated_at = now()
   where id = p_id;
  insert into public.ai_preview_ops (user_id, preview_id, op, idem_key, credits)
  values (p_user, p_id, 'regen', v_key, 1);

  return query select 'ok'::text, v_row.storage_path, v_bal;
end $$;

-- 5e) Regenerate failed / rejected: give the row back, nothing charged.
create or replace function public.ai_preview_release_regen(p_user uuid, p_id uuid)
returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.ai_image_previews set status = 'open', updated_at = now()
   where id = p_id and user_id = p_user and status = 'regenerating';
$$;

-- 5f) "Kullan": free session pays 2 here, paid session pays 0. One transaction;
--     a repeat (same or different key) sees status 'used' and charges nothing.
create or replace function public.ai_preview_commit_use(p_user uuid, p_id uuid, p_key text)
returns table (o_outcome text, o_charged integer, o_balance integer,
               o_url text, o_alt text, o_prompt text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.ai_image_previews;
  v_cost integer;
  v_ok boolean;
  v_bal integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select * into v_row from public.ai_image_previews where id = p_id and user_id = p_user for update;
  if not found then
    return query select 'invalid'::text, 0, null::integer, null::text, null::text, null::text; return;
  end if;
  if v_row.status = 'used' then
    return query select 'done'::text, 0, null::integer, v_row.image_url, v_row.alt, v_row.image_prompt; return;
  end if;
  if v_row.status <> 'open' then
    return query select 'invalid'::text, 0, null::integer, null::text, null::text, null::text; return;
  end if;
  if v_row.expires_at <= now() then
    return query select 'expired'::text, 0, null::integer, null::text, null::text, null::text; return;
  end if;

  v_cost := case when v_row.kind = 'free' then 2 else 0 end;
  if v_cost > 0 then
    select c.ok, c.balance into v_ok, v_bal
      from public.consume_ai_credits(p_user, v_cost, 'ai-preview-use:' || p_id::text) c;
    if not v_ok then
      return query select 'no_credits'::text, 0, v_bal, null::text, null::text, null::text; return;
    end if;
  end if;

  update public.ai_image_previews
     set status = 'used', used_at = now(), updated_at = now(),
         charged_credits = charged_credits + v_cost
   where id = p_id;
  insert into public.ai_preview_ops (user_id, preview_id, op, idem_key, credits)
  values (p_user, p_id, 'use', 'use:' || p_id::text || ':' || p_key, v_cost);

  return query select 'ok'::text, v_cost, v_bal, v_row.image_url, v_row.alt, v_row.image_prompt;
end $$;

-- 5g) Discard / failed create: mark the row and hand back the file to delete.
--     The free preview is NOT returned (consumed only by commit_create).
create or replace function public.ai_preview_release(p_user uuid, p_id uuid, p_status text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_path text;
begin
  if p_status not in ('discarded', 'expired') then
    raise exception 'invalid status';
  end if;
  update public.ai_image_previews
     set status = p_status, updated_at = now()
   where id = p_id and user_id = p_user and status in ('generating', 'open', 'regenerating')
  returning storage_path into v_path;
  return v_path;
end $$;

-- 6) Cleanup of abandoned previews (called by the existing CRON_SECRET cron;
--    storage objects can only be removed through the Storage API, so the cron
--    removes the files and then calls ai_preview_mark_cleaned).
create or replace function public.ai_preview_expire_stale()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  update public.ai_image_previews
     set status = 'expired', updated_at = now()
   where (status in ('open', 'generating', 'regenerating') and expires_at < now())
      or (status = 'generating' and updated_at < now() - interval '10 minutes');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.ai_preview_pending_cleanup(p_limit integer default 200)
returns table (id uuid, storage_path text)
language sql security definer set search_path = public, pg_temp as $$
  select p.id, p.storage_path from public.ai_image_previews p
   where p.status in ('expired', 'discarded') and p.storage_path is not null
   limit greatest(p_limit, 1);
$$;

create or replace function public.ai_preview_mark_cleaned(p_ids uuid[])
returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.ai_image_previews set storage_path = null where id = any (p_ids);
$$;

create or replace function public.ai_preview_purge(p_older interval default interval '1 day')
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  delete from public.ai_image_previews
   where status in ('expired', 'discarded', 'used') and updated_at < now() - p_older;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 6b) Read-only: is the account's one free preview still unused?
create or replace function public.ai_preview_free_available(p_user uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (select 1 from public.ai_preview_entitlements where user_id = p_user);
$$;

-- 7) Function privileges: nobody but service_role may execute.
do $$
declare f text;
begin
  foreach f in array array[
    'ai_preview_claim_slot(uuid,uuid,uuid,text,text)',
    'ai_preview_commit_create(uuid,uuid,text,text,text,text)',
    'ai_preview_claim_regen(uuid,uuid,text)',
    'ai_preview_commit_regen(uuid,uuid,text,text,text,text,text)',
    'ai_preview_release_regen(uuid,uuid)',
    'ai_preview_commit_use(uuid,uuid,text)',
    'ai_preview_release(uuid,uuid,text)',
    'ai_preview_expire_stale()',
    'ai_preview_pending_cleanup(integer)',
    'ai_preview_mark_cleaned(uuid[])',
    'ai_preview_purge(interval)',
    'ai_preview_free_available(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;

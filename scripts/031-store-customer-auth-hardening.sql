-- Store customer auth hardening.
-- NOT applied automatically. Review, then run once in the Supabase SQL editor.
-- Idempotent: safe to re-run. The application degrades gracefully if this is
-- not applied yet (sessions are simply not revoked on password change and rate
-- limits fall back to per-instance memory), but apply it before relying on the
-- hardening.
--
-- PRE-CHECK (should return zero rows; the unique index below fails otherwise):
--   select project_id, lower(email), count(*)
--   from public.store_customers
--   group by 1, 2 having count(*) > 1;

-- 1. Session revocation: bumped on every password change / reset.
alter table public.store_customers
  add column if not exists password_changed_at timestamptz;

alter table public.store_customers enable row level security;

-- 2. One account per (store, e-mail) regardless of case. Aborts with a clear
--    message instead of failing half way if case-insensitive duplicates exist.
do $$
begin
  if exists (
    select 1 from public.store_customers
    group by project_id, lower(email)
    having count(*) > 1
  ) then
    raise exception 'store_customers has case-insensitive duplicate e-mails per project; resolve them first';
  end if;
end $$;

-- The app looks e-mails up by exact (lower-cased) equality; normalise legacy rows.
update public.store_customers set email = lower(email) where email <> lower(email);

create unique index if not exists store_customers_project_lower_email_uidx
  on public.store_customers (project_id, lower(email));

-- 3. Reset tokens are looked up by their hash.
create index if not exists store_customers_reset_token_hash_idx
  on public.store_customers (reset_token_hash)
  where reset_token_hash is not null;

-- 4. Shared rate limit counters (keys are HMAC hashes; no raw IP / e-mail).
create table if not exists public.store_auth_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null default 0
);

alter table public.store_auth_rate_limits enable row level security;
revoke all on public.store_auth_rate_limits from anon, authenticated, public;
grant select, insert, update, delete on public.store_auth_rate_limits to service_role;

create or replace function public.store_auth_rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_start timestamptz;
begin
  insert into public.store_auth_rate_limits as t (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    window_start = case
      when t.window_start + make_interval(secs => p_window_seconds) <= v_now then v_now
      else t.window_start end,
    count = case
      when t.window_start + make_interval(secs => p_window_seconds) <= v_now then 1
      else t.count + 1 end
  returning t.count, t.window_start into v_count, v_start;

  -- Opportunistic cleanup of long-expired counters.
  if random() < 0.01 then
    delete from public.store_auth_rate_limits where window_start < v_now - interval '1 day';
  end if;

  allowed := v_count <= p_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - v_now)))::integer)
  end;
  return next;
end;
$$;

revoke all on function public.store_auth_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.store_auth_rate_limit_hit(text, integer, integer) to service_role;

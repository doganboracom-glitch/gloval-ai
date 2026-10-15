-- Fixed-window counters used by POST /api/transcribe (see lib/transcribe-limit.ts).
-- Mirrors the objects applied to production (migration `create_rate_limit_counters`),
-- re-extracted from the live catalog. Idempotent: safe to run repeatedly.
--
-- `subject` never holds a raw IP or e-mail. Stored forms:
--   stt:{min|day}:user:<auth user uuid>
--   stt:{min|day}:anon:<random id from the signed gloval_anon cookie>
--   stt:{min|day}:ip:<HMAC-SHA256(server secret, "ip:" || ip), first 32 chars>

create table if not exists public.rate_limit_counters (
  subject text primary key,
  hit_count integer not null default 0,
  window_started_at timestamptz not null default now()
);

alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from anon, authenticated;

create or replace function public.reserve_rate_limit(p_subject text, p_limit integer, p_window_seconds integer)
returns table(allowed boolean, hit_count integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rate_limit_counters;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_subject, 0));

  select * into v_row from public.rate_limit_counters where subject = p_subject;

  if not found then
    insert into public.rate_limit_counters(subject, hit_count, window_started_at)
    values (p_subject, 1, now())
    returning * into v_row;
    return query select true, v_row.hit_count, v_row.window_started_at + make_interval(secs => p_window_seconds);
    return;
  end if;

  if v_row.window_started_at + make_interval(secs => p_window_seconds) <= now() then
    update public.rate_limit_counters
      set hit_count = 1, window_started_at = now()
      where subject = p_subject
      returning * into v_row;
    return query select true, v_row.hit_count, v_row.window_started_at + make_interval(secs => p_window_seconds);
    return;
  end if;

  if v_row.hit_count >= p_limit then
    return query select false, v_row.hit_count, v_row.window_started_at + make_interval(secs => p_window_seconds);
    return;
  end if;

  update public.rate_limit_counters
    set hit_count = hit_count + 1
    where subject = p_subject
    returning * into v_row;
  return query select true, v_row.hit_count, v_row.window_started_at + make_interval(secs => p_window_seconds);
end;
$$;

create or replace function public.release_rate_limit(p_subject text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.rate_limit_counters
    set hit_count = greatest(hit_count - 1, 0)
    where subject = p_subject;
$$;

revoke all on function public.reserve_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.release_rate_limit(text) from public, anon, authenticated;
grant execute on function public.reserve_rate_limit(text, integer, integer) to service_role;
grant execute on function public.release_rate_limit(text) to service_role;

Hiçbir şey uygulanmadı, dosya yazılmadı, PR açılmadı. Aşağıda (a) Part 1'in yalnızca değişen kısımları, (b) Part 2'nin tamamı var.

## (a) Part 1: değişen kısımlar

**1) Sarmalayıcı (dosyanın en başı ve en sonu)**

```sql
-- NOT APPLIED
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ... Part 1 içeriği (aşağıdaki iki değişiklik dışında aynı) ...

commit;
```

**2) `ads_plans.currency` satırı (yalnızca bu satır değişiyor)**

```sql
  currency             text not null default 'TRY' check (currency ~ '^[A-Z]{3}$'),
```

**3) RLS bölümünde `ads_usage_events_select_own` politikası KALDIRILDI.** Bu blok silinir:

```sql
-- KALDIRILDI:
-- create policy ads_usage_events_select_own on public.ads_usage_events
--   for select to authenticated
--   using (user_id = (select auth.uid()));
```

RLS bölümündeki yorum şöyle güncellenir:

```sql
-- ads_usage_events, ads_free_usage and ads_alerts: RLS enabled, no policies,
-- so anon and authenticated see no rows. Only service_role can access them.
-- No INSERT/UPDATE/DELETE policies exist on any ads_* table: clients cannot write.
-- service_role bypasses RLS.
```

**4) Yetki bölümünde `authenticated` SELECT listesinden `ads_usage_events` çıkarıldı.** Bu blok şöyle olur:

```sql
-- authenticated: SELECT only (RLS limits rows to the owner).
-- ads_usage_events is intentionally NOT granted: model, token and cost data
-- must not be visible to users.
grant select on table
  public.ads_brands,
  public.ads_plans,
  public.ads_actions,
  public.ads_recommendations
to authenticated;
```

`revoke all ... from anon, authenticated` bloğu ve `service_role` tam DML yetkisi değişmedi. `ads_usage_events` zaten `service_role` listesinde.

## (b) Part 2: kredi ve ücretsiz hak RPC'leri (TAM)

```sql
-- NOT APPLIED
-- ============================================================
-- GLOVAL Ads (BETA) -- credit RPCs, free-quota RPCs, retention
-- Part 2 of 2. Requires Part 1.
-- All functions: SECURITY DEFINER, empty search_path, service_role only.
-- ============================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ------------------------------------------------------------
-- Preflight (run manually before applying; expect 0):
--   select count(*) from public.ai_credit_transactions
--    where reason like 'ads:%' or reason like 'ads\_refund:%';
-- If ai_credit_transactions is large, create the unique index below
-- with CREATE UNIQUE INDEX CONCURRENTLY outside this transaction instead.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Credit idempotency: one charge and one refund per reason per user.
-- reason format: ads:<action>:<requestId>  /  ads_refund:<action>:<requestId>
-- ------------------------------------------------------------
create unique index ai_credit_tx_ads_reason_uniq
  on public.ai_credit_transactions (user_id, reason)
  where reason like 'ads:%' or reason like 'ads\_refund:%';

-- ------------------------------------------------------------
-- Free-quota reservations: makes reserve and release idempotent per request
-- and remembers which day's counters were incremented.
-- ------------------------------------------------------------
create table public.ads_free_reservations (
  request_id  text primary key
                check (length(request_id) between 1 and 128),
  subjects    text[] not null
                check (cardinality(subjects) between 1 and 8),
  day         date not null,
  released_at timestamptz,
  created_at  timestamptz not null default now()
);

create index ads_free_reservations_created_idx
  on public.ads_free_reservations (created_at);

alter table public.ads_free_reservations enable row level security;

revoke all on table public.ads_free_reservations from anon, authenticated;
grant select, insert, update, delete on table public.ads_free_reservations to service_role;

-- Retention support: find anon hashes to wipe without a sequential scan.
create index ads_usage_anon_hash_idx
  on public.ads_usage_events (created_at)
  where anon_subject_hash is not null;

-- ------------------------------------------------------------
-- reserve_ads_free_actions
-- All-or-nothing across subjects; Europe/Istanbul calendar day.
-- Idempotent per p_request_id: a repeated call with the same id while the
-- reservation is active returns already_reserved = true and does not
-- increment again. A released reservation can be reserved again.
-- Lock order (request lock first, then subjects sorted) is the same in
-- reserve and release, so concurrent calls cannot deadlock.
-- ------------------------------------------------------------
create or replace function public.reserve_ads_free_actions(
  p_request_id text,
  p_subjects   text[],
  p_limits     integer[]
)
returns table (allowed boolean, blocked_subject text, already_reserved boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day     date := (now() at time zone 'Europe/Istanbul')::date;
  v_res     public.ads_free_reservations%rowtype;
  v_subject text;
  v_used    integer;
  i         integer;
begin
  if p_request_id is null or length(p_request_id) not between 1 and 128 then
    raise exception 'request id must be 1 to 128 characters';
  end if;

  if p_subjects is null or p_limits is null
     or cardinality(p_subjects) = 0
     or cardinality(p_subjects) > 8
     or cardinality(p_subjects) <> cardinality(p_limits)
     or array_ndims(p_subjects) <> 1
     or array_ndims(p_limits) <> 1
     or array_lower(p_subjects, 1) <> 1
     or array_lower(p_limits, 1) <> 1 then
    raise exception 'subjects and limits must be one-dimensional, non-empty, equal length, at most 8';
  end if;

  if exists (
    select 1 from unnest(p_subjects) s
     where s is null or length(s) not between 1 and 200
  ) then
    raise exception 'each subject must be 1 to 200 characters';
  end if;

  if exists (select 1 from unnest(p_limits) l where l is null or l < 1) then
    raise exception 'each limit must be a positive integer';
  end if;

  if (select count(distinct s) from unnest(p_subjects) s) <> cardinality(p_subjects) then
    raise exception 'subjects must be distinct';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ads_free_req:' || p_request_id, 0));

  select * into v_res
    from public.ads_free_reservations r
   where r.request_id = p_request_id;

  if found and v_res.released_at is null then
    return query select true, null::text, true;
    return;
  end if;

  for v_subject in select s from unnest(p_subjects) s order by s loop
    perform pg_advisory_xact_lock(hashtextextended('ads_free:' || v_subject, 0));
  end loop;

  for i in 1 .. cardinality(p_subjects) loop
    select u.used into v_used
      from public.ads_free_usage u
     where u.subject = p_subjects[i]
       and u.day = v_day;

    if coalesce(v_used, 0) >= p_limits[i] then
      return query select false, p_subjects[i], false;
      return;
    end if;
  end loop;

  for i in 1 .. cardinality(p_subjects) loop
    insert into public.ads_free_usage (subject, day, used)
    values (p_subjects[i], v_day, 1)
    on conflict (subject, day)
    do update set used = public.ads_free_usage.used + 1;
  end loop;

  insert into public.ads_free_reservations (request_id, subjects, day)
  values (p_request_id, p_subjects, v_day)
  on conflict (request_id)
  do update set subjects    = excluded.subjects,
                day         = excluded.day,
                released_at = null,
                created_at  = now();

  return query select true, null::text, false;
end
$$;

-- ------------------------------------------------------------
-- release_ads_free_actions
-- Gives back the free actions of a failed request. Idempotent: returns true
-- only the first time. Decrements the counters of the day that was
-- reserved, even if the Istanbul day has changed since.
-- ------------------------------------------------------------
create or replace function public.release_ads_free_actions(p_request_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res     public.ads_free_reservations%rowtype;
  v_subject text;
begin
  if p_request_id is null or length(p_request_id) not between 1 and 128 then
    raise exception 'request id must be 1 to 128 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ads_free_req:' || p_request_id, 0));

  select * into v_res
    from public.ads_free_reservations r
   where r.request_id = p_request_id
   for update;

  if not found or v_res.released_at is not null then
    return false;
  end if;

  for v_subject in select s from unnest(v_res.subjects) s order by s loop
    perform pg_advisory_xact_lock(hashtextextended('ads_free:' || v_subject, 0));
  end loop;

  update public.ads_free_usage u
     set used = greatest(u.used - 1, 0)
   where u.subject = any (v_res.subjects)
     and u.day = v_res.day;

  update public.ads_free_reservations r
     set released_at = now()
   where r.request_id = p_request_id;

  return true;
end
$$;

-- ------------------------------------------------------------
-- ads_charge_credits
-- Idempotency key = p_reason ('ads:<action>:<requestId>'). Same user and
-- same reason charges once; a repeat returns already_charged = true with the
-- original amount and does not charge again. Serialised per user with the
-- same advisory lock key as consume_ai_credits, so it also serialises
-- against the existing credit flows.
-- ------------------------------------------------------------
create or replace function public.ads_charge_credits(
  p_user_id uuid,
  p_amount  integer,
  p_reason  text
)
returns table (ok boolean, balance integer, already_charged boolean, charged_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance  integer;
  v_existing integer;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000 then
    raise exception 'amount must be between 1 and 1000';
  end if;
  if p_reason is null or p_reason !~ '^ads:[a-z_]{1,32}:[A-Za-z0-9_-]{8,128}$' then
    raise exception 'reason must match ads:<action>:<requestId>';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select coalesce(sum(t.amount), 0)::integer into v_balance
    from public.ai_credit_transactions t
   where t.user_id = p_user_id;

  select -t.amount into v_existing
    from public.ai_credit_transactions t
   where t.user_id = p_user_id
     and t.reason = p_reason
     and t.amount < 0
   limit 1;

  if v_existing is not null then
    return query select true, v_balance, true, v_existing;
    return;
  end if;

  if v_balance < p_amount then
    return query select false, v_balance, false, 0;
    return;
  end if;

  insert into public.ai_credit_transactions (user_id, kind, amount, reason)
  values (p_user_id, 'usage', -p_amount, p_reason);

  return query select true, v_balance - p_amount, false, p_amount;
end
$$;

-- ------------------------------------------------------------
-- ads_refund_credits
-- Refunds exactly the amount of the original charge identified by
-- p_charge_reason, once. Returns refunded = false (no new row) when there is
-- no such charge or it was already refunded. The refund reason is derived
-- from the charge reason ('ads:x:y' -> 'ads_refund:x:y'), and the unique
-- index makes a second refund impossible even under a race.
-- ------------------------------------------------------------
create or replace function public.ads_refund_credits(
  p_user_id       uuid,
  p_charge_reason text
)
returns table (refunded boolean, balance integer, refunded_amount integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount        integer;
  v_refund_reason text;
  v_balance       integer;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;
  if p_charge_reason is null
     or p_charge_reason !~ '^ads:[a-z_]{1,32}:[A-Za-z0-9_-]{8,128}$' then
    raise exception 'charge reason must match ads:<action>:<requestId>';
  end if;

  v_refund_reason := 'ads_refund:' || substr(p_charge_reason, 5);

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select -t.amount into v_amount
    from public.ai_credit_transactions t
   where t.user_id = p_user_id
     and t.reason = p_charge_reason
     and t.amount < 0
   limit 1;

  if v_amount is null
     or exists (
       select 1
         from public.ai_credit_transactions t
        where t.user_id = p_user_id
          and t.reason = v_refund_reason
     ) then
    select coalesce(sum(t.amount), 0)::integer into v_balance
      from public.ai_credit_transactions t
     where t.user_id = p_user_id;
    return query select false, v_balance, 0;
    return;
  end if;

  insert into public.ai_credit_transactions (user_id, kind, amount, reason)
  values (p_user_id, 'usage', v_amount, v_refund_reason);

  select coalesce(sum(t.amount), 0)::integer into v_balance
    from public.ai_credit_transactions t
   where t.user_id = p_user_id;

  return query select true, v_balance, v_amount;
end
$$;

-- ------------------------------------------------------------
-- ads_record_alert_once
-- Returns true only for the first call of a kind on an Istanbul day; the
-- caller sends the admin email only when it returns true.
-- ------------------------------------------------------------
create or replace function public.ads_record_alert_once(
  p_kind   text,
  p_detail jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_kind is null or length(p_kind) not between 1 and 100 then
    raise exception 'alert kind must be 1 to 100 characters';
  end if;

  insert into public.ads_alerts (kind, day, detail)
  values (p_kind, (now() at time zone 'Europe/Istanbul')::date, p_detail)
  on conflict (kind, day) do nothing;

  get diagnostics n = row_count;
  return n = 1;
end
$$;

-- ------------------------------------------------------------
-- ads_purge_expired (retention). Call from a CRON_SECRET-protected route.
-- Deletes in batches; the caller repeats while any returned count equals
-- the batch size.
--   free usage counters       : p_free_usage_days  (default 14 days)
--   free reservations         : p_reservation_days (default 7 days)
--   anon subject hashes       : p_anon_hash_days   (default 30 days; the hash
--                               is set to null, the cost row is kept)
--   usage events (cost rows)  : p_usage_days       (default 400 days)
--   alerts                    : p_alert_days       (default 90 days)
-- ------------------------------------------------------------
create or replace function public.ads_purge_expired(
  p_free_usage_days  integer default 14,
  p_reservation_days integer default 7,
  p_anon_hash_days   integer default 30,
  p_usage_days       integer default 400,
  p_alert_days       integer default 90,
  p_batch            integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today  date := (now() at time zone 'Europe/Istanbul')::date;
  n_free   integer;
  n_res    integer;
  n_hash   integer;
  n_usage  integer;
  n_alert  integer;
begin
  if p_free_usage_days < 1 or p_reservation_days < 1 or p_anon_hash_days < 1
     or p_usage_days < 1 or p_alert_days < 1 then
    raise exception 'retention periods must be at least 1 day';
  end if;
  if p_batch < 1 or p_batch > 50000 then
    raise exception 'batch must be between 1 and 50000';
  end if;

  delete from public.ads_free_usage
   where ctid in (
     select f.ctid
       from public.ads_free_usage f
      where f.day < v_today - p_free_usage_days
      limit p_batch
   );
  get diagnostics n_free = row_count;

  delete from public.ads_free_reservations
   where ctid in (
     select r.ctid
       from public.ads_free_reservations r
      where r.created_at < now() - make_interval(days => p_reservation_days)
      limit p_batch
   );
  get diagnostics n_res = row_count;

  update public.ads_usage_events
     set anon_subject_hash = null
   where ctid in (
     select e.ctid
       from public.ads_usage_events e
      where e.anon_subject_hash is not null
        and e.created_at < now() - make_interval(days => p_anon_hash_days)
      limit p_batch
   );
  get diagnostics n_hash = row_count;

  delete from public.ads_usage_events
   where ctid in (
     select e.ctid
       from public.ads_usage_events e
      where e.created_at < now() - make_interval(days => p_usage_days)
      limit p_batch
   );
  get diagnostics n_usage = row_count;

  delete from public.ads_alerts
   where ctid in (
     select a.ctid
       from public.ads_alerts a
      where a.day < v_today - p_alert_days
      limit p_batch
   );
  get diagnostics n_alert = row_count;

  return jsonb_build_object(
    'free_usage',   n_free,
    'reservations', n_res,
    'anon_hashes',  n_hash,
    'usage_events', n_usage,
    'alerts',       n_alert,
    'batch',        p_batch
  );
end
$$;

-- ------------------------------------------------------------
-- Function privileges: service_role only.
-- ------------------------------------------------------------
revoke all on function public.reserve_ads_free_actions(text, text[], integer[])
  from public, anon, authenticated;
revoke all on function public.release_ads_free_actions(text)
  from public, anon, authenticated;
revoke all on function public.ads_charge_credits(uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.ads_refund_credits(uuid, text)
  from public, anon, authenticated;
revoke all on function public.ads_record_alert_once(text, jsonb)
  from public, anon, authenticated;
revoke all on function public.ads_purge_expired(integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated;

grant execute on function public.reserve_ads_free_actions(text, text[], integer[]) to service_role;
grant execute on function public.release_ads_free_actions(text) to service_role;
grant execute on function public.ads_charge_credits(uuid, integer, text) to service_role;
grant execute on function public.ads_refund_credits(uuid, text) to service_role;
grant execute on function public.ads_record_alert_once(text, jsonb) to service_role;
grant execute on function public.ads_purge_expired(integer, integer, integer, integer, integer, integer) to service_role;

commit;
```

## Koda bırakılan öneriler (SQL dışı)

- **`anon_subject_hash`:** `HMAC-SHA256(secret, subject)` ile üretilir. Sır `ADS_ANON_HASH_SECRET` env'inde durur, repoya ya da DB'ye yazılmaz. Aynı salt `ads:cookie:`/`ads:ip:` sayaç anahtarlarında da kullanılır, yani ham IP ve çerez değeri hiçbir yere yazılmaz. Hash 30 gün sonra `ads_purge_expired` ile null'lanır, maliyet satırı kalır.
- **`last_error` temizliği:** yazılmadan önce kodda tek bir temizleyici fonksiyondan geçer. Uzunluk 200 karakterle sınırlanır. Token, `Bearer`, `refresh_token`, `client_secret`, e-posta benzeri desenler ve URL sorgu parametreleri maskelenir. Sağlayıcı hata gövdesi yerine yalnızca bir hata kodu ve kısa mesaj saklanır.
- **`AdsPlan.currency`:** TS tipi `'TRY'` yerine `string` (`^[A-Z]{3}$` ile doğrulanır) olur. Bütçe üst sınırı karşılaştırması aynı para biriminde yapılır.
- **`ads_usage_events`** artık istemciden hiç okunamaz. Yönetici maliyet raporları sunucu tarafında `service_role` ile okunur.
- **Zamanlanmış temizlik:** günlük bir `CRON_SECRET` korumalı rota `ads_purge_expired`'i çağırır ve dönen sayılardan biri parti boyutuna eşitse tekrar çağırır.
- **Ücretsiz hak çağrıları** artık `request_id` alır: `reserve_ads_free_actions(requestId, subjects, limits)` ve hata olursa `release_ads_free_actions(requestId)`. Aynı `requestId` ücretsiz hakkı ikinci kez düşmez.
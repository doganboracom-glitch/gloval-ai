-- 039: Magaza yapay zeka asistani (metin; gorsel icin de ortak) kredi motoru.
-- UYGULANMADI; yalnizca gosterim icindir.
--
-- MEVCUT kredi sistemi kullanilir: defter `ai_credit_transactions`, harcama
-- `consume_ai_credits`, iade `refund_ai_credits` (ikisi de kullanici basina
-- `pg_advisory_xact_lock(hashtext(user_id))` ile serilestirilir). Yeni bir
-- bakiye ya da defter YOKTUR. Defter `kind` kisiti degismez: kayitlar
-- kind='usage' olarak, `reason` alaninda etiketle yazilir:
--   store_ai_text:<attempt_id>   store_ai_image:<attempt_id>   store_ai_refund:<attempt_id>
--
-- Yeni tablolar: store_ai_series (deneme serisi sayaci), store_ai_attempts
-- (her istek; idempotency + es zamanlilik + hiz siniri + iade takibi).
-- Politika (maliyet, dongu, limitler) TS'de `lib/store-ai-constants.ts`;
-- fonksiyonlar bunlari parametre olarak alir.

begin;

create table if not exists public.store_ai_series (
  project_id      uuid        not null references public.projects(id) on delete cascade,
  product_key     uuid        not null,
  kind            text        not null check (kind in ('text', 'image')),
  succeeded_count integer     not null default 0 check (succeeded_count >= 0),
  updated_at      timestamptz not null default now(),
  primary key (project_id, product_key, kind)
);

create table if not exists public.store_ai_attempts (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  project_id     uuid        not null references public.projects(id) on delete cascade,
  product_key    uuid        not null,
  kind           text        not null check (kind in ('text', 'image')),
  request_id     uuid        not null,
  attempt_no     integer     not null check (attempt_no >= 1),
  charged_amount integer     not null default 0 check (charged_amount >= 0),
  status         text        not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  refunded       boolean     not null default false,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz,
  unique (user_id, request_id)
);

create index if not exists store_ai_attempts_user_created_idx
  on public.store_ai_attempts (user_id, created_at desc);
create index if not exists store_ai_attempts_user_pending_idx
  on public.store_ai_attempts (user_id) where status = 'pending';

alter table public.store_ai_series enable row level security;
alter table public.store_ai_attempts enable row level security;
-- Politika yok: yalnizca service_role (RLS'i atlar) erisir.

revoke all on public.store_ai_series from public, anon, authenticated;
revoke all on public.store_ai_attempts from public, anon, authenticated;
grant select, insert, update on public.store_ai_series to service_role;
grant select, insert, update on public.store_ai_attempts to service_role;

-- Bir denemeyi atomik baslatir: kilit, eski bekleyenlerin iadesi, idempotency,
-- es zamanlilik + hiz + gunluk limit, seri sirasi, ucretliyse kredi dusumu
-- (bakiye kontrolu + defter kaydi tek islemde) ve deneme kaydi.
-- outcome: started | replay | busy | rate_minute | rate_daily | insufficient
create or replace function public.store_ai_begin(
  p_user_id       uuid,
  p_project_id    uuid,
  p_product_key   uuid,
  p_kind          text,
  p_request_id    uuid,
  p_cost          integer,
  p_free_cycle    integer,
  p_per_minute    integer,
  p_concurrent    integer,
  p_daily         integer,
  p_stale_seconds integer
)
returns table(outcome text, out_attempt_id uuid, out_attempt_no integer, out_charged integer, out_balance integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stale   record;
  v_exist   record;
  v_count   integer;
  v_n       integer;
  v_charge  integer;
  v_id      uuid;
  v_ok      boolean;
  v_bal     integer;
  v_pending integer;
  v_minute  integer;
  v_day     integer;
begin
  if p_kind not in ('text', 'image') then
    raise exception 'invalid kind';
  end if;
  if p_cost is null or p_cost < 0 or p_free_cycle is null or p_free_cycle < 1
     or p_per_minute < 1 or p_concurrent < 1 or p_daily < 1 or p_stale_seconds < 1 then
    raise exception 'invalid parameters';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Olu istekler: yanit hic donmediyse ucretli deneme iade edilir, sayaca sayilmaz.
  for v_stale in
    select id, charged_amount
      from public.store_ai_attempts
     where user_id = p_user_id
       and status = 'pending'
       and created_at < now() - make_interval(secs => p_stale_seconds)
       for update
  loop
    update public.store_ai_attempts
       set status = 'failed', finished_at = now(), refunded = (v_stale.charged_amount > 0)
     where id = v_stale.id;
    if v_stale.charged_amount > 0 then
      perform public.refund_ai_credits(p_user_id, v_stale.charged_amount, 'store_ai_refund:' || v_stale.id);
    end if;
  end loop;

  -- Ayni istek tekrar gelirse ikinci kez dusulmez.
  select id, attempt_no, charged_amount into v_exist
    from public.store_ai_attempts
   where user_id = p_user_id and request_id = p_request_id;
  if found then
    return query select 'replay'::text, v_exist.id, v_exist.attempt_no, v_exist.charged_amount, 0;
    return;
  end if;

  select count(*) into v_pending
    from public.store_ai_attempts where user_id = p_user_id and status = 'pending';
  if v_pending >= p_concurrent then
    return query select 'busy'::text, null::uuid, 0, 0, 0;
    return;
  end if;

  select count(*) into v_minute
    from public.store_ai_attempts
   where user_id = p_user_id and created_at > now() - interval '1 minute';
  if v_minute >= p_per_minute then
    return query select 'rate_minute'::text, null::uuid, 0, 0, 0;
    return;
  end if;

  select count(*) into v_day
    from public.store_ai_attempts
   where user_id = p_user_id and created_at > now() - interval '24 hours';
  if v_day >= p_daily then
    return query select 'rate_daily'::text, null::uuid, 0, 0, 0;
    return;
  end if;

  select succeeded_count into v_count
    from public.store_ai_series
   where project_id = p_project_id and product_key = p_product_key and kind = p_kind;
  v_n := coalesce(v_count, 0) + 1;
  v_charge := case when (v_n - 1) % p_free_cycle = 0 then p_cost else 0 end;
  v_id := gen_random_uuid();

  if v_charge > 0 then
    select c.ok, c.balance into v_ok, v_bal
      from public.consume_ai_credits(p_user_id, v_charge, 'store_ai_' || p_kind || ':' || v_id) c;
    if not coalesce(v_ok, false) then
      return query select 'insufficient'::text, null::uuid, v_n, v_charge, coalesce(v_bal, 0);
      return;
    end if;
  else
    select coalesce(sum(amount), 0)::integer into v_bal
      from public.ai_credit_transactions where user_id = p_user_id;
  end if;

  insert into public.store_ai_attempts
    (id, user_id, project_id, product_key, kind, request_id, attempt_no, charged_amount)
  values
    (v_id, p_user_id, p_project_id, p_product_key, p_kind, p_request_id, v_n, v_charge);

  return query select 'started'::text, v_id, v_n, v_charge, v_bal;
end;
$function$;

-- Denemeyi bitirir. Basari: seri sayaci +1. Basarisiz: ucretliyse iade, sayac artmaz.
-- Tekrar cagrilirsa mevcut durumu dondurur (idempotent).
create or replace function public.store_ai_finish(p_attempt_id uuid, p_success boolean)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_a    record;
begin
  select user_id into v_user from public.store_ai_attempts where id = p_attempt_id;
  if v_user is null then
    return 'not_found';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select * into v_a from public.store_ai_attempts where id = p_attempt_id for update;
  if v_a.status <> 'pending' then
    return v_a.status;
  end if;

  if p_success then
    update public.store_ai_attempts
       set status = 'succeeded', finished_at = now()
     where id = p_attempt_id;
    insert into public.store_ai_series (project_id, product_key, kind, succeeded_count)
    values (v_a.project_id, v_a.product_key, v_a.kind, 1)
    on conflict (project_id, product_key, kind)
    do update set succeeded_count = public.store_ai_series.succeeded_count + 1, updated_at = now();
    return 'succeeded';
  end if;

  update public.store_ai_attempts
     set status = 'failed', finished_at = now(), refunded = (v_a.charged_amount > 0)
   where id = p_attempt_id;
  if v_a.charged_amount > 0 then
    perform public.refund_ai_credits(v_a.user_id, v_a.charged_amount, 'store_ai_refund:' || p_attempt_id);
  end if;
  return 'failed';
end;
$function$;

-- Kullanici bir sonucu "Kullan" ile uygulayinca seri sifirlanir.
create or replace function public.store_ai_reset_series(p_project_id uuid, p_product_key uuid, p_kind text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.store_ai_series
     set succeeded_count = 0, updated_at = now()
   where project_id = p_project_id and product_key = p_product_key and kind = p_kind;
$function$;

revoke all on function public.store_ai_begin(uuid, uuid, uuid, text, uuid, integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.store_ai_finish(uuid, boolean) from public, anon, authenticated;
revoke all on function public.store_ai_reset_series(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.store_ai_begin(uuid, uuid, uuid, text, uuid, integer, integer, integer, integer, integer, integer) to service_role;
grant execute on function public.store_ai_finish(uuid, boolean) to service_role;
grant execute on function public.store_ai_reset_series(uuid, uuid, text) to service_role;

commit;

-- 048: remove PayTR from per-store payment settings.
-- Idempotent, single transaction. NOT applied automatically; run it by hand after the
-- application code that no longer knows PayTR is deployed.
--
-- What it does, in order:
--   1) active_card_provider default becomes 'iyzico'.
--   2) rows with active_card_provider = 'paytr' are switched to 'iyzico'.
--   3) rows with provider = 'paytr' get secret_encrypted = NULL (stored PayTR keys are discarded).
--   4) the active_card_provider CHECK constraint is dropped (if present) and re-added so it only
--      accepts 'iyzico'. It is added AFTER step 2, so existing rows already satisfy it.
-- Affected row counts are reported with RAISE NOTICE.
--
-- Deliberately NOT touched: ecommerce_orders.payment_provider = 'paytr' (historical orders keep
-- their provider so receipts, refunds and reporting stay accurate).
-- Row level security is not touched.

begin;

do $$
declare
  v_switched integer := 0;
  v_secrets_cleared integer := 0;
  v_secret_nullable text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ecommerce_payment_settings'
      and column_name = 'active_card_provider'
  ) then
    raise notice '048: active_card_provider column not found (migration 036 not applied); nothing to do.';
    return;
  end if;

  -- 1) New default.
  alter table public.ecommerce_payment_settings
    alter column active_card_provider set default 'iyzico';

  -- 2) Move existing PayTR selections to iyzico.
  update public.ecommerce_payment_settings
     set active_card_provider = 'iyzico'
   where active_card_provider = 'paytr';
  get diagnostics v_switched = row_count;
  raise notice '048: active_card_provider paytr -> iyzico: % row(s)', v_switched;

  -- 3) Discard stored secrets of rows whose primary provider is PayTR.
  select is_nullable into v_secret_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'ecommerce_payment_settings'
    and column_name = 'secret_encrypted';

  if v_secret_nullable is null then
    raise notice '048: secret_encrypted column not found; skipping secret cleanup.';
  elsif v_secret_nullable = 'NO' then
    raise exception '048: secret_encrypted is NOT NULL, cannot clear PayTR secrets; aborting (transaction rolled back).';
  else
    update public.ecommerce_payment_settings
       set secret_encrypted = null
     where provider = 'paytr'
       and secret_encrypted is not null;
    get diagnostics v_secrets_cleared = row_count;
    raise notice '048: secret_encrypted cleared on provider=paytr rows: % row(s)', v_secrets_cleared;
  end if;

  -- 4) Constraint accepts only iyzico (guarded drop + add).
  if exists (
    select 1 from pg_constraint
    where conname = 'ecommerce_payment_settings_active_card_provider'
      and conrelid = 'public.ecommerce_payment_settings'::regclass
  ) then
    alter table public.ecommerce_payment_settings
      drop constraint ecommerce_payment_settings_active_card_provider;
  end if;

  alter table public.ecommerce_payment_settings
    add constraint ecommerce_payment_settings_active_card_provider
    check (active_card_provider in ('iyzico'));
  raise notice '048: active_card_provider constraint now allows only iyzico.';
end $$;

commit;

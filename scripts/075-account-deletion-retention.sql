-- Account deletion: keep legally required records, detach them from the user.
-- NOT applied automatically: review, then run once. Idempotent.
--
-- Root cause of "Hesap silinemedi": lib/account.ts detaches payment/order rows
-- by setting user_id / owner_id / project_id to NULL before deleting the auth
-- user, but those columns were NOT NULL (ON DELETE CASCADE). The UPDATE failed
-- with SQLSTATE 23502 (not_null_violation) for every account that owns a
-- billing_subscriptions row (all of them, FREE included), so the delete
-- aborted before auth.admin.deleteUser ran.
--
-- Fix: make the link nullable and switch the FKs from CASCADE to SET NULL.
-- Deleting a user/project then anonymizes these rows instead of destroying
-- them, even if application code forgets to detach first. Amounts, provider
-- references, invoices and order contents are untouched.
--
-- RLS policies (auth.uid() = user_id / owner_id) keep working: NULL never
-- equals auth.uid(), so an anonymized row is visible to no end user.
-- No data is modified by this script; only column nullability and FK actions.

begin;

alter table public.billing_subscriptions  alter column user_id    drop not null;
alter table public.billing_transactions   alter column user_id    drop not null;
alter table public.addon_purchases        alter column user_id    drop not null;
alter table public.domain_orders          alter column user_id    drop not null;
alter table public.ecommerce_orders       alter column owner_id   drop not null;
alter table public.ecommerce_orders       alter column project_id drop not null;
alter table public.ecommerce_order_items  alter column project_id drop not null;

alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_user_id_fkey;
alter table public.billing_subscriptions add  constraint billing_subscriptions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.billing_transactions drop constraint if exists billing_transactions_user_id_fkey;
alter table public.billing_transactions add  constraint billing_transactions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.addon_purchases drop constraint if exists addon_purchases_user_id_fkey;
alter table public.addon_purchases add  constraint addon_purchases_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.domain_orders drop constraint if exists domain_orders_user_id_fkey;
alter table public.domain_orders add  constraint domain_orders_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.ecommerce_orders drop constraint if exists ecommerce_orders_owner_id_fkey;
alter table public.ecommerce_orders add  constraint ecommerce_orders_owner_id_fkey
  foreign key (owner_id) references auth.users(id) on delete set null;

alter table public.ecommerce_orders drop constraint if exists ecommerce_orders_project_id_fkey;
alter table public.ecommerce_orders add  constraint ecommerce_orders_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;

alter table public.ecommerce_order_items drop constraint if exists ecommerce_order_items_project_id_fkey;
alter table public.ecommerce_order_items add  constraint ecommerce_order_items_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;

commit;

-- Verification (run manually after applying; expect 7 rows, all 'YES' / 'SET NULL'):
--   select c.conrelid::regclass::text as tbl, a.attname, a.attnotnull,
--          case c.confdeltype when 'n' then 'SET NULL' else 'OTHER' end as on_delete
--   from pg_constraint c
--   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
--   where c.conname in ('billing_subscriptions_user_id_fkey','billing_transactions_user_id_fkey',
--     'addon_purchases_user_id_fkey','domain_orders_user_id_fkey','ecommerce_orders_owner_id_fkey',
--     'ecommerce_orders_project_id_fkey','ecommerce_order_items_project_id_fkey');

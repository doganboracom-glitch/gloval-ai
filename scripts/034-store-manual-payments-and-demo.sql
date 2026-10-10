-- 034: manual payments (bank transfer / cash on delivery) audit trail + demo store allowlist.
-- Idempotent. NOT applied automatically. The application code works without it:
--  * the audit columns are skipped when missing (retry without them),
--  * a missing demo_stores table means "no demo stores" (fail closed); the
--    DEMO_STORE_PROJECT_IDS env var works as an alternative allowlist.

-- 1) Who confirmed / cancelled a manual order, and when.
alter table public.ecommerce_orders
  add column if not exists payment_confirmed_by uuid,
  add column if not exists payment_confirmed_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancelled_at timestamptz;

-- 2) Demo stores: the ONLY stores allowed to use the mock card in production.
-- RLS is enabled with NO policies, so only the service role (platform operator)
-- can read or write it; tenants can never mark their own store as a demo.
create table if not exists public.demo_stores (
  project_id uuid primary key references public.projects(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.demo_stores enable row level security;

-- Example (run by the operator, not by the app):
--   insert into public.demo_stores (project_id) values ('<demo project uuid>')
--   on conflict do nothing;

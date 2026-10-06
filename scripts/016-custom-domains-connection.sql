-- 016: custom domain connection tracking (ownership vs DNS vs Vercel vs SSL).
--
-- NOT applied automatically. Review, then apply in the Supabase SQL editor.
-- Idempotent and non-destructive.
--
-- `status = 'active'` keeps meaning "ownership proven via TXT". Whether the
-- site is actually reachable is tracked by the three stage columns below.
--
-- Existing rows get NULL stage columns on purpose: NULL ssl_status marks a
-- "legacy" row that keeps being served exactly as before (existing site
-- bindings are preserved) until its first connection check. Only rows created
-- AFTER this migration get the 'pending' defaults and must pass every stage.

alter table public.custom_domains
  add column if not exists verification_token text,
  add column if not exists dns_status text,
  add column if not exists vercel_status text,
  add column if not exists ssl_status text,
  add column if not exists vercel_verification jsonb,
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_error text;

alter table public.custom_domains
  drop constraint if exists custom_domains_dns_status_check,
  drop constraint if exists custom_domains_vercel_status_check,
  drop constraint if exists custom_domains_ssl_status_check;

alter table public.custom_domains
  add constraint custom_domains_dns_status_check
    check (dns_status is null or dns_status in ('pending', 'configured', 'misconfigured')),
  add constraint custom_domains_vercel_status_check
    check (vercel_status is null or vercel_status in ('not_configured', 'pending', 'needs_verification', 'connected', 'error')),
  add constraint custom_domains_ssl_status_check
    check (ssl_status is null or ssl_status in ('pending', 'ready', 'error'));

-- Defaults apply to NEW rows only; existing rows stay NULL (= legacy).
alter table public.custom_domains
  alter column dns_status set default 'pending',
  alter column vercel_status set default 'not_configured',
  alter column ssl_status set default 'pending';

-- Used by the reconciliation cron to find domains still being connected.
create index if not exists custom_domains_connecting_idx
  on public.custom_domains (last_checked_at nulls first)
  where status = 'active' and ssl_status is not null and ssl_status <> 'ready';

-- Customers can read these columns through the existing select policy but have
-- no write policy, so they cannot flip a stage themselves.

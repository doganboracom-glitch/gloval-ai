-- Custom domains: only DNS-verified domains claim a hostname globally.
-- Review and apply manually in production; this file is intentionally not run by v0.
-- Before applying, inspect any duplicate active rows and resolve them manually.

begin;

-- The old global unique index makes pending/failed verification attempts block
-- every other user. Remove only that index and replace it with an active-only one.
drop index if exists public.custom_domains_domain_unique;

create unique index if not exists custom_domains_active_domain_unique
  on public.custom_domains (domain)
  where status = 'active';

commit;

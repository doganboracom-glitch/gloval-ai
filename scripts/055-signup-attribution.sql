-- 055: First-touch marketing attribution captured at sign-up (UTM + ad click IDs).
-- Idempotent: safe to run on a database that already has the original table.
--
-- Written only by the `saveSignupAttribution` server action via the service
-- role; RLS is enabled with no policies, so anon/authenticated clients cannot
-- read or write it. Rows older than 24 months are deleted by the daily cron
-- (/api/cron/domain-reconciliation -> sweepOldSignupAttribution).
--
-- Data minimisation, enforced here as well as in lib/attribution.ts:
--   * every text column has a char_length cap
--   * landing_path is a bare pathname: no query string, no fragment
--   * referrer_domain is a bare hostname: no scheme, path or port

create table if not exists public.signup_attribution (
  user_id uuid primary key references auth.users (id) on delete cascade,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  gclid text,
  fbclid text,
  landing_path text,
  referrer_domain text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('signup_attribution_utm_source_len',      'utm_source is null or char_length(utm_source) <= 200'),
      ('signup_attribution_utm_medium_len',      'utm_medium is null or char_length(utm_medium) <= 200'),
      ('signup_attribution_utm_campaign_len',    'utm_campaign is null or char_length(utm_campaign) <= 200'),
      ('signup_attribution_utm_term_len',        'utm_term is null or char_length(utm_term) <= 200'),
      ('signup_attribution_utm_content_len',     'utm_content is null or char_length(utm_content) <= 200'),
      ('signup_attribution_gclid_len',           'gclid is null or char_length(gclid) <= 500'),
      ('signup_attribution_fbclid_len',          'fbclid is null or char_length(fbclid) <= 500'),
      ('signup_attribution_landing_path_len',    'landing_path is null or char_length(landing_path) <= 300'),
      ('signup_attribution_landing_path_shape',  $c$landing_path is null or (left(landing_path, 1) = '/' and landing_path !~ '[?#]')$c$),
      ('signup_attribution_referrer_domain_len', 'referrer_domain is null or char_length(referrer_domain) <= 255'),
      ('signup_attribution_referrer_domain_shape', $c$referrer_domain is null or referrer_domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*$'$c$)
    ) as t(name, expr)
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.signup_attribution'::regclass and conname = c.name
    ) then
      execute format('alter table public.signup_attribution add constraint %I check (%s)', c.name, c.expr);
    end if;
  end loop;
end $$;

alter table public.signup_attribution enable row level security;

revoke all on table public.signup_attribution from public, anon, authenticated;

-- First write wins (insert-only upsert) and the retention sweep deletes, so no update grant.
grant select, insert, delete on table public.signup_attribution to service_role;

create index if not exists signup_attribution_utm_source_idx
  on public.signup_attribution (utm_source, created_at desc);

create index if not exists signup_attribution_created_at_idx
  on public.signup_attribution (created_at);

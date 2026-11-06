-- Draft only: do not apply in this task.
-- Adds per-user Google Ads insight cache, opt-in report preferences,
-- opaque unsubscribe capabilities, and an atomic daily AI-analysis limit.

create table if not exists public.ads_google_insights_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.ads_connections(id) on delete cascade,
  cache_key text not null check (cache_key ~ '^(report|analysis):[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, connection_id, cache_key),
  check (expires_at > refreshed_at)
);

create index if not exists ads_google_insights_cache_expiry_idx
  on public.ads_google_insights_cache (expires_at);

create table if not exists public.ads_google_report_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  connection_id uuid not null references public.ads_connections(id) on delete cascade,
  weekly_enabled boolean not null default false,
  monthly_enabled boolean not null default false,
  last_weekly_period_end date,
  last_monthly_period_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ads_google_report_preferences_weekly_idx
  on public.ads_google_report_preferences (last_weekly_period_end)
  where weekly_enabled;

create index if not exists ads_google_report_preferences_monthly_idx
  on public.ads_google_report_preferences (last_monthly_period_end)
  where monthly_enabled;

create table if not exists public.ads_google_report_unsubscribe_tokens (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ads_google_report_unsubscribe_user_idx
  on public.ads_google_report_unsubscribe_tokens (user_id);

create table if not exists public.ads_google_ai_analysis_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  analysis_count smallint not null default 0 check (analysis_count between 0 and 3),
  primary key (user_id, usage_day)
);

alter table public.ads_google_insights_cache enable row level security;
alter table public.ads_google_insights_cache force row level security;
alter table public.ads_google_report_preferences enable row level security;
alter table public.ads_google_report_preferences force row level security;
alter table public.ads_google_report_unsubscribe_tokens enable row level security;
alter table public.ads_google_report_unsubscribe_tokens force row level security;
alter table public.ads_google_ai_analysis_usage enable row level security;
alter table public.ads_google_ai_analysis_usage force row level security;

revoke all on public.ads_google_insights_cache from public, anon, authenticated;
revoke all on public.ads_google_report_preferences from public, anon, authenticated;
revoke all on public.ads_google_report_unsubscribe_tokens from public, anon, authenticated;
revoke all on public.ads_google_ai_analysis_usage from public, anon, authenticated;
grant select, insert, update, delete on public.ads_google_insights_cache to service_role;
grant select, insert, update, delete on public.ads_google_report_preferences to service_role;
grant select, insert, update, delete on public.ads_google_report_unsubscribe_tokens to service_role;
grant select, insert, update, delete on public.ads_google_ai_analysis_usage to service_role;

create or replace function public.ads_claim_google_ads_analysis(p_user_id uuid)
returns table (allowed boolean, used smallint, usage_day date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (clock_timestamp() at time zone 'Europe/Istanbul')::date;
  v_used smallint;
begin
  insert into public.ads_google_ai_analysis_usage as current_usage (user_id, usage_day, analysis_count)
  values (p_user_id, v_day, 1)
  on conflict (user_id, usage_day)
  do update set analysis_count = current_usage.analysis_count + 1
  where current_usage.analysis_count < 3
  returning current_usage.analysis_count into v_used;

  if found then
    return query select true, v_used, v_day;
  else
    select usage.analysis_count
      into v_used
      from public.ads_google_ai_analysis_usage as usage
      where usage.user_id = p_user_id and usage.usage_day = v_day;
    return query select false, coalesce(v_used, 3::smallint), v_day;
  end if;
end;
$$;

revoke all on function public.ads_claim_google_ads_analysis(uuid) from public, anon, authenticated;
grant execute on function public.ads_claim_google_ads_analysis(uuid) to service_role;

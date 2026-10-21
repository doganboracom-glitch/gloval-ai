-- 070-ai-image-previews.sql
-- DRAFT: shown to the owner for review. NOT applied to any database.
--
-- Server-side preview sessions for "AI ile üret" images (about now; services /
-- gallery reuse the same tables through `target`), plus the one-time free
-- preview entitlement per ACCOUNT.
--
-- Credits are NOT stored here. They keep going through the existing
-- `consume_ai_credits` ledger RPC; this schema only holds the preview state
-- machine and the free-preview marker. Every state change is a single
-- conditional UPDATE / INSERT, so concurrent or repeated requests cannot
-- double-spend.

-- 1) One row per account, inserted atomically when the FIRST preview is
--    successfully produced. The primary key makes "consume the free preview"
--    race-safe: only one INSERT can win.
create table if not exists public.ai_preview_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  free_preview_used_at timestamptz not null default now()
);

-- 2) Preview sessions.
create table if not exists public.ai_image_previews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  section_key text not null,                       -- e.g. 'about:2'
  target text not null default 'about',            -- 'about' | 'services' | 'gallery'
  status text not null default 'generating'
    check (status in ('generating','open','regenerating','using','used','discarded','expired')),
  -- 'free'  : the account's one free preview; 'Kullan' costs 2 credits.
  -- 'paid'  : 2 credits were charged when the preview was produced; 'Kullan' is free.
  kind text check (kind in ('free','paid')),
  image_url text,
  storage_path text,
  alt text,
  image_prompt text,
  charged_credits integer not null default 0,      -- informational (ledger is the source of truth)
  regen_count integer not null default 0,
  last_regen_key text,                             -- idempotency key of the last regenerate
  use_key text,                                    -- idempotency key of the 'Kullan' call
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  used_at timestamptz
);

-- At most ONE live preview per account + site + section. This is what makes a
-- double click on "AI ile üret" create (and charge) a single preview.
create unique index if not exists ai_image_previews_one_live
  on public.ai_image_previews (user_id, project_id, section_key)
  where status in ('generating','open','regenerating','using');

create index if not exists ai_image_previews_sweep
  on public.ai_image_previews (status, expires_at);

-- 3) RLS: owners may READ their own rows; every write goes through the
--    service-role server code (no insert/update/delete policies).
alter table public.ai_preview_entitlements enable row level security;
alter table public.ai_image_previews enable row level security;

drop policy if exists "owner reads own preview entitlement" on public.ai_preview_entitlements;
create policy "owner reads own preview entitlement"
  on public.ai_preview_entitlements for select
  using (auth.uid() = user_id);

drop policy if exists "owner reads own previews" on public.ai_image_previews;
create policy "owner reads own previews"
  on public.ai_image_previews for select
  using (auth.uid() = user_id);

-- 4) Cleanup is done by the existing CRON_SECRET cron
--    (/api/cron/domain-reconciliation -> sweepAiImagePreviews): it expires
--    stale rows, deletes their storage objects, and drops finished rows older
--    than 1 day. Nothing to schedule in SQL.

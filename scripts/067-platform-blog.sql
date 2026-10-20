-- 067: gloval.ai's OWN blog (platform_blog_*), managed from /admin. Idempotent.
--
-- NOT to be confused with public.site_blog_posts (064), which is the per-customer
-- blog feature. This is the platform marketing blog served at gloval.ai/blog.
--
-- Access model (same as 064/065): RLS is ON and anon/authenticated have NO
-- privileges at all. Public pages read published rows server-side through the
-- service-role client; every write goes through admin-gated server actions that
-- also run the Markdown sanitiser. Only service_role touches these tables.

begin;

create table if not exists public.platform_blog_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint platform_blog_categories_slug_key unique (slug),
  constraint platform_blog_categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  constraint platform_blog_categories_name_len check (char_length(name) between 1 and 80)
);

create table if not exists public.platform_blog_posts (
  id uuid primary key default gen_random_uuid(),
  -- Existing file-based slugs are imported verbatim; they are the public URLs.
  slug text not null,
  title text not null,
  excerpt text,
  -- Restricted Markdown subset (## heading, - list, **bold**, [link](url)).
  -- Raw HTML is stripped on write by sanitizeLegalMarkup (lib/legal-markup.ts).
  body text not null default '',
  category_id uuid references public.platform_blog_categories(id) on delete set null,
  tags text[] not null default '{}',
  cover_url text,
  cover_alt text,
  seo_title text,
  meta_description text,
  status text not null default 'draft',
  published_at timestamptz,
  author_name text not null default 'GLOVAL AI',
  -- Minutes, computed server-side from body on every save.
  reading_time integer not null default 1,
  language text not null default 'tr',
  noindex boolean not null default false,
  -- Drives the homepage "latest from the blog" strip (getFeaturedPosts today).
  featured boolean not null default false,
  -- Per-locale overrides for the existing English copy, so the migration does
  -- not drop it: { "en": { title, excerpt, body, seo_title, meta_description,
  -- cover_alt, tags } }. Empty for new posts until an editor adds a translation.
  translations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_blog_posts_slug_key unique (slug),
  constraint platform_blog_posts_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  constraint platform_blog_posts_status_check check (status in ('draft', 'published', 'scheduled')),
  constraint platform_blog_posts_published_at_check check (status = 'draft' or published_at is not null),
  constraint platform_blog_posts_title_len check (char_length(title) between 1 and 200),
  constraint platform_blog_posts_body_len check (char_length(body) <= 40000),
  constraint platform_blog_posts_language_check check (language ~ '^[a-z]{2}$'),
  constraint platform_blog_posts_reading_time_check check (reading_time >= 1)
);

-- A scheduled post goes live once published_at passes; readers filter on
-- (status = 'published' or (status = 'scheduled' and published_at <= now())).
create index if not exists platform_blog_posts_live_idx
  on public.platform_blog_posts (published_at desc)
  where status in ('published', 'scheduled');

create index if not exists platform_blog_posts_category_idx
  on public.platform_blog_posts (category_id);

create or replace function public.platform_blog_posts_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists platform_blog_posts_touch_updated_at on public.platform_blog_posts;
create trigger platform_blog_posts_touch_updated_at
  before update on public.platform_blog_posts
  for each row execute function public.platform_blog_posts_touch_updated_at();

alter table public.platform_blog_categories enable row level security;
alter table public.platform_blog_posts enable row level security;

-- No policies on purpose: with RLS on and no policy, anon/authenticated can
-- neither read nor write. Privileges are also revoked as defence in depth
-- (Supabase default privileges would otherwise grant them).
revoke all on public.platform_blog_categories from anon, authenticated;
revoke all on public.platform_blog_posts from anon, authenticated;
grant all on public.platform_blog_categories to service_role;
grant all on public.platform_blog_posts to service_role;

commit;

-- F1b: customer-site blog + IndexNow queue. Idempotent: safe to run repeatedly.
--
-- Access model (matches the rest of the app): public pages read through the
-- server-side service-role client, so there is NO anon policy. A signed-in
-- owner may read/write only the posts of projects they own. `index_queue` is
-- service_role only.

create table if not exists public.site_blog_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  slug text not null,
  title text not null,
  excerpt text,
  -- Restricted Markdown subset (## heading, - list, **bold**, [link](url)).
  -- Raw HTML is stripped on write by sanitizeLegalMarkup (lib/legal-markup.ts).
  body text not null default '',
  keywords text[] not null default '{}',
  seo_title text,
  meta_description text,
  cover_url text,
  cover_alt text,
  status text not null default 'draft',
  -- false = <meta robots noindex,follow> and kept out of sitemap + RSS
  -- (first-setup posts stay noindex until personalized).
  indexable boolean not null default true,
  published_at timestamptz,
  ai_generated boolean not null default false,
  personalized boolean not null default false,
  sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_blog_posts_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  constraint site_blog_posts_status_check check (status in ('draft', 'published', 'scheduled')),
  constraint site_blog_posts_title_len check (char_length(title) between 1 and 200),
  constraint site_blog_posts_body_len check (char_length(body) <= 40000),
  constraint site_blog_posts_project_slug_key unique (project_id, slug)
);

create index if not exists site_blog_posts_live_idx
  on public.site_blog_posts (project_id, published_at desc)
  where status = 'published' and sample = false;

create or replace function public.site_blog_posts_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists site_blog_posts_touch_updated_at on public.site_blog_posts;
create trigger site_blog_posts_touch_updated_at
  before update on public.site_blog_posts
  for each row execute function public.site_blog_posts_touch_updated_at();

alter table public.site_blog_posts enable row level security;
revoke all on public.site_blog_posts from anon;

drop policy if exists site_blog_posts_owner_select on public.site_blog_posts;
create policy site_blog_posts_owner_select on public.site_blog_posts
  for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = site_blog_posts.project_id and p.owner_id = (select auth.uid())
  ));

drop policy if exists site_blog_posts_owner_insert on public.site_blog_posts;
create policy site_blog_posts_owner_insert on public.site_blog_posts
  for insert to authenticated
  with check (exists (
    select 1 from public.projects p
    where p.id = site_blog_posts.project_id and p.owner_id = (select auth.uid())
  ));

drop policy if exists site_blog_posts_owner_update on public.site_blog_posts;
create policy site_blog_posts_owner_update on public.site_blog_posts
  for update to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = site_blog_posts.project_id and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = site_blog_posts.project_id and p.owner_id = (select auth.uid())
  ));

drop policy if exists site_blog_posts_owner_delete on public.site_blog_posts;
create policy site_blog_posts_owner_delete on public.site_blog_posts
  for delete to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = site_blog_posts.project_id and p.owner_id = (select auth.uid())
  ));

-- IndexNow / search-engine ping queue. Server-side only.
create table if not exists public.index_queue (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  reason text not null,
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint index_queue_project_url_key unique (project_id, url)
);

create index if not exists index_queue_due_idx on public.index_queue (next_run_at);

alter table public.index_queue enable row level security;
revoke all on public.index_queue from anon, authenticated;
grant all on public.index_queue to service_role;

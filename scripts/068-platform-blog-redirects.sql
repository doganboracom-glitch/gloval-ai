-- Old slugs of renamed platform blog posts. The public post route looks the
-- requested slug up here and permanently redirects to the post's current slug.
-- Same access model as 067: RLS on, no anon/authenticated policies, service role only.

create table if not exists public.platform_blog_redirects (
  old_slug text primary key,
  post_id uuid not null references public.platform_blog_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint platform_blog_redirects_slug_format check (old_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(old_slug) <= 80)
);

create index if not exists platform_blog_redirects_post_idx
  on public.platform_blog_redirects (post_id);

alter table public.platform_blog_redirects enable row level security;

revoke all on public.platform_blog_redirects from anon, authenticated;
grant all on public.platform_blog_redirects to service_role;

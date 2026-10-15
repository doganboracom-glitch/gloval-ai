-- 065: site_blog_posts writes are server-only.
-- Owners may only READ their own posts through RLS. Every write goes through
-- server actions using the service role, which enforce plan, publish gate,
-- Markdown sanitising and the per-project post cap. Idempotent.
begin;

drop policy if exists site_blog_posts_owner_insert on public.site_blog_posts;
drop policy if exists site_blog_posts_owner_update on public.site_blog_posts;
drop policy if exists site_blog_posts_owner_delete on public.site_blog_posts;

revoke insert, update, delete on public.site_blog_posts from authenticated;

commit;

-- RLS does not cover TRUNCATE; drop the remaining non-read privileges too.
revoke truncate, references, trigger on public.site_blog_posts from anon, authenticated;

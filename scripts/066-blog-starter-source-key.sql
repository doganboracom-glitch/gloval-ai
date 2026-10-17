-- Atomic idempotency for the starter blog posts.
--
-- Each starter post carries a fixed source key ('starter:0' .. 'starter:2').
-- A unique (project_id, source_key) index makes the database reject a second
-- insert of the same starter post, so a double click, a retry or two
-- concurrent runs (project creation + button) can never create duplicates.
--
-- Safe to run more than once. The app works before this is applied (it writes
-- without the key); apply it to get the atomic guarantee.

alter table public.site_blog_posts
  add column if not exists source_key text;

alter table public.site_blog_posts
  drop constraint if exists site_blog_posts_source_key_len;
alter table public.site_blog_posts
  add constraint site_blog_posts_source_key_len
  check (source_key is null or char_length(source_key) <= 100);

-- Existing untouched starter posts get their key, oldest first, at most three
-- per project, so the button correctly sees them as "already added".
with ranked as (
  select
    id,
    row_number() over (partition by project_id order by created_at, id) - 1 as n
  from public.site_blog_posts
  where ai_generated
    and not personalized
    and not sample
    and not indexable
    and source_key is null
)
update public.site_blog_posts as p
set source_key = 'starter:' || ranked.n
from ranked
where p.id = ranked.id
  and ranked.n < 3;

-- The index name contains "source_key": the app recognises a 23505 violation
-- on it and treats it as "already created", not as an error.
create unique index if not exists site_blog_posts_project_source_key_idx
  on public.site_blog_posts (project_id, source_key)
  where source_key is not null;

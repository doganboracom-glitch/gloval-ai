-- 069: short audit trail for the platform blog admin (who, when, which post). Idempotent.
--
-- Same access model as 067/068: RLS is ON and anon/authenticated have no
-- privileges. Only the service-role client used by the admin-gated server
-- actions writes or reads it. post_id is deliberately NOT a foreign key, so a
-- deleted post keeps its history (the slug and title are copied into the row).

begin;

create table if not exists public.platform_blog_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid not null,
  actor_email text not null,
  action text not null,
  post_id uuid,
  post_slug text,
  post_title text,
  detail jsonb,
  constraint platform_blog_audit_action_len check (char_length(action) between 1 and 40)
);

create index if not exists platform_blog_audit_at_idx
  on public.platform_blog_audit (at desc);

create index if not exists platform_blog_audit_post_idx
  on public.platform_blog_audit (post_id)
  where post_id is not null;

alter table public.platform_blog_audit enable row level security;

revoke all on public.platform_blog_audit from public, anon, authenticated;
grant select, insert on public.platform_blog_audit to service_role;

commit;

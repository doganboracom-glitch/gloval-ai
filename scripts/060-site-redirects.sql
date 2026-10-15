-- Permanent (301) redirects left behind when a site page slug changes.
-- Idempotent: safe to run more than once. Only service_role can read or write.

create table if not exists public.site_redirects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_path text not null,
  to_path text not null,
  created_at timestamptz not null default now(),
  constraint site_redirects_paths_differ check (from_path <> to_path),
  constraint site_redirects_from_is_path check (from_path like '/%'),
  constraint site_redirects_to_is_path check (to_path like '/%'),
  constraint site_redirects_project_from_unique unique (project_id, from_path)
);

create index if not exists site_redirects_project_id_idx
  on public.site_redirects (project_id);

alter table public.site_redirects enable row level security;

revoke all on public.site_redirects from anon, authenticated;
grant select, insert, update, delete on public.site_redirects to service_role;

drop policy if exists "site_redirects_service_role_all" on public.site_redirects;
create policy "site_redirects_service_role_all"
  on public.site_redirects
  for all
  to service_role
  using (true)
  with check (true);

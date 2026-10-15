-- Draft backups for the editor's "Yedekler" list (see lib/project-backups.ts).
-- NOT applied automatically: review, then run once. Idempotent.
--
-- Scope: ONLY projects.schema_data (the working draft). The product catalog,
-- orders, customers, payment settings and contact messages are never copied.
-- The published site is read through projects.published_version_id ->
-- project_versions and is never touched by anything in this file except the
-- stale-row prune, which skips published_version_id and every 'published' row.

create table if not exists public.project_backups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly', 'pre_restore')),
  schema_data jsonb not null,
  schema_version integer not null default 1,
  content_hash text not null,
  bytes integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists project_backups_project_kind_created_idx
  on public.project_backups (project_id, kind, created_at desc);

create index if not exists project_backups_expires_at_idx
  on public.project_backups (expires_at);

-- One daily and one weekly backup per project per UTC day (idempotent writes).
-- pre_restore is excluded: several can legitimately happen on the same day.
create unique index if not exists project_backups_one_per_day_idx
  on public.project_backups (project_id, kind, ((created_at at time zone 'utc')::date))
  where kind in ('daily', 'weekly');

alter table public.project_backups enable row level security;

-- Owners may only READ their own backups. There is no insert/update/delete
-- policy, so writes are possible only through the service_role (which bypasses RLS).
revoke all on public.project_backups from anon, authenticated;
grant select on public.project_backups to authenticated;

drop policy if exists project_backups_owner_select on public.project_backups;
create policy project_backups_owner_select on public.project_backups
  for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_backups.project_id and p.owner_id = auth.uid()
    )
  );

-- Daily cron: removes non-published version rows older than p_cutoff for owners
-- WITHOUT version history (everyone except PRO / E-Ticaret; mirrors toPlanCode
-- in lib/pricing-config.ts). Never deletes 'published' rows or the row a
-- project's published_version_id points at. Returns the number of deleted rows.
create or replace function public.prune_stale_project_versions(p_cutoff timestamptz, p_limit integer default 2000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with doomed as (
    select v.id
    from public.project_versions v
    join public.projects p on p.id = v.project_id
    where v.created_at < p_cutoff
      and v.label is distinct from 'published'
      and v.id is distinct from p.published_version_id
      and not exists (
        select 1
        from public.billing_subscriptions s
        join public.billing_plans bp on bp.id = s.plan_id
        where s.user_id = p.owner_id
          and s.status in ('trialing', 'active', 'past_due', 'suspended')
          and (
            lower(bp.code) like '%ecommerce%'
            or lower(bp.code) like '%eticaret%'
            or lower(bp.code) like '%pro%'
          )
      )
    order by v.created_at
    limit greatest(p_limit, 0)
  )
  delete from public.project_versions v
  using doomed d
  where v.id = d.id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_stale_project_versions(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.prune_stale_project_versions(timestamptz, integer) to service_role;

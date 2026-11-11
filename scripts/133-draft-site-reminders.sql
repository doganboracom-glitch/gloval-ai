-- Draft site reminder emails (d7 / d30 / m6 / m12).
-- Idempotent. NOT applied automatically: review and apply manually BEFORE
-- deploying the code. The cron stays off until DRAFT_REMINDERS_AUTO_ENABLED=true.
--
-- 1) public.draft_site_reminders: one row per attempt (sent / failed / dry_run).
--    A project gets at most one SENT row per kind (partial unique index).
-- 2) projects.reminders_muted* and profiles.draft_reminders_opt_out*.
-- 3) public.draft_reminder_last_activity(uuid[]): the newest "real" activity per
--    project (projects.updated_at, project_versions, products, collections, store
--    AI attempts). Signing in alone is never activity.
--
-- Existing policies and grants are not touched. The new table is service-role only.
begin;

create table if not exists public.draft_site_reminders (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects(id) on delete cascade,
  user_id               uuid not null,
  kind                  text not null check (kind in ('d7', 'd30', 'm6', 'm12')),
  status                text not null check (status in ('sent', 'failed', 'dry_run')),
  error_code            text null check (error_code is null or char_length(error_code) <= 64),
  notification_log_id   uuid null,
  created_at            timestamptz not null default now()
);

create unique index if not exists draft_site_reminders_sent_once_uidx
  on public.draft_site_reminders (project_id, kind)
  where status = 'sent';

create index if not exists draft_site_reminders_project_idx
  on public.draft_site_reminders (project_id, created_at desc);

alter table public.draft_site_reminders enable row level security;

revoke all on table public.draft_site_reminders from public, anon, authenticated;
grant select, insert, update, delete on table public.draft_site_reminders to service_role;

alter table public.projects
  add column if not exists reminders_muted boolean not null default false,
  add column if not exists reminders_muted_at timestamptz null;

alter table public.profiles
  add column if not exists draft_reminders_opt_out boolean not null default false,
  add column if not exists draft_reminders_opt_out_at timestamptz null;

-- plpgsql (late binding): a missing optional table never blocks this migration;
-- the cron treats an RPC error as "do nothing" and sends no email.
create or replace function public.draft_reminder_last_activity(p_project_ids uuid[])
returns table (project_id uuid, last_activity_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select p.id,
         greatest(
           p.updated_at,
           (select max(v.created_at) from public.project_versions v where v.project_id = p.id),
           (select max(e.updated_at) from public.ecommerce_products e where e.project_id = p.id),
           (select max(c.created_at) from public.ecommerce_collections c where c.project_id = p.id),
           (select max(a.created_at) from public.store_ai_attempts a where a.project_id = p.id)
         )
    from public.projects p
   where p.id = any(p_project_ids);
end;
$$;

revoke all on function public.draft_reminder_last_activity(uuid[]) from public, anon, authenticated;
grant execute on function public.draft_reminder_last_activity(uuid[]) to service_role;

commit;

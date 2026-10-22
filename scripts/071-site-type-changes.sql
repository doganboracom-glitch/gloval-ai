-- 071: audit trail for admin site-type changes (corporate / ecommerce / catalog).
--
-- One row per change: who, when, what it was, what it became and why. Written
-- only by the service-role client from the admin `setSiteType` action; RLS is on
-- with no policies, so anon/authenticated users can neither read nor write it.
-- No FK to projects on purpose: the trail must outlive a deleted site.

create table if not exists public.site_type_changes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  actor_id uuid,
  actor_email text not null,
  from_type text not null,
  from_mode text not null,
  to_type text not null,
  to_mode text not null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists site_type_changes_project_idx
  on public.site_type_changes (project_id, created_at desc);

alter table public.site_type_changes enable row level security;

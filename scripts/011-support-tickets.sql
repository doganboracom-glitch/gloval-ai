-- Support ticket system: extends the existing support_tickets /
-- support_ticket_messages tables (no second system). Idempotent.

create sequence if not exists public.support_ticket_number_seq start 1000;

alter table public.support_tickets
  add column if not exists ticket_number text,
  add column if not exists department text not null default 'other',
  add column if not exists service text,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists idempotency_key text;

update public.support_tickets
  set ticket_number = 'GLV-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0')
  where ticket_number is null;

alter table public.support_tickets
  alter column ticket_number set default ('GLV-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0')),
  alter column ticket_number set not null;

create unique index if not exists support_tickets_ticket_number_key on public.support_tickets (ticket_number);
create unique index if not exists support_tickets_user_idem_key
  on public.support_tickets (user_id, idempotency_key) where idempotency_key is not null;
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, updated_at desc);

-- Unified status model.
alter table public.support_tickets drop constraint if exists support_tickets_status_check;
update public.support_tickets set status = 'answered' where status = 'pending';
update public.support_tickets set status = 'resolved' where status = 'closed';
alter table public.support_tickets
  add constraint support_tickets_status_check
  check (status in ('open', 'in_progress', 'waiting_user', 'answered', 'resolved'));

alter table public.support_tickets drop constraint if exists support_tickets_department_check;
alter table public.support_tickets
  add constraint support_tickets_department_check
  check (department in ('technical', 'billing', 'domain', 'website', 'ai', 'account', 'other'));

alter table public.support_tickets drop constraint if exists support_tickets_service_check;
alter table public.support_tickets
  add constraint support_tickets_service_check
  check (service is null or service in ('website', 'ecommerce', 'ai_content', 'visual_logo', 'domain', 'hosting', 'billing', 'other'));

alter table public.support_ticket_messages
  add column if not exists sender_id uuid references auth.users(id) on delete set null;

-- Attachment metadata (files live in the PRIVATE `support-attachments` bucket).
create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  message_id uuid references public.support_ticket_messages(id) on delete cascade,
  uploader_id uuid references auth.users(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_attachments_ticket_idx on public.support_ticket_attachments (ticket_id);

-- RLS: owners read their own; all writes by users go through server actions
-- (service role, after explicit ownership checks). Policies below are the
-- defence-in-depth layer: a user can never write an admin message or touch
-- another user's rows even with a forged client call.
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.support_ticket_attachments enable row level security;

drop policy if exists support_tickets_select_own on public.support_tickets;
create policy support_tickets_select_own on public.support_tickets
  for select to authenticated using (user_id = auth.uid());

drop policy if exists support_tickets_insert_own on public.support_tickets;
create policy support_tickets_insert_own on public.support_tickets
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'open' and source = 'app');

drop policy if exists support_messages_select_own on public.support_ticket_messages;
create policy support_messages_select_own on public.support_ticket_messages
  for select to authenticated using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

drop policy if exists support_messages_insert_own on public.support_ticket_messages;
create policy support_messages_insert_own on public.support_ticket_messages
  for insert to authenticated with check (
    author_type = 'user' and sender_id = auth.uid()
    and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

drop policy if exists support_attachments_select_own on public.support_ticket_attachments;
create policy support_attachments_select_own on public.support_ticket_attachments
  for select to authenticated using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
  );

-- Private bucket, no storage.objects policies for anon/authenticated: every
-- read/write goes through the service role after an authorization check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

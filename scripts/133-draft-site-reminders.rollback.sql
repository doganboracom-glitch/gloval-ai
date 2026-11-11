-- Rolls back 133-draft-site-reminders.sql. Destroys the reminder history and the
-- per-project / per-user mute flags.
begin;

drop function if exists public.draft_reminder_last_activity(uuid[]);
drop table if exists public.draft_site_reminders;

alter table public.projects
  drop column if exists reminders_muted,
  drop column if exists reminders_muted_at;

alter table public.profiles
  drop column if exists draft_reminders_opt_out,
  drop column if exists draft_reminders_opt_out_at;

commit;

-- Drop the two mail tables that were added early on and are no longer used.
--
-- The mail system runs on the Mailcow API plus the mail columns on
-- public.custom_domains, so public.mail_domain_settings and public.mailboxes
-- are dead weight. Verified before dropping: both tables are empty (0 rows),
-- no other table has a foreign key into them, and no view, function or trigger
-- references them. Their own RLS policies go away together with the tables.
--
-- Deliberately no CASCADE: if something unexpected still depends on either
-- table, the statement fails instead of silently removing that dependency.
-- Idempotent: safe to re-run.

drop table if exists public.mail_domain_settings;
drop table if exists public.mailboxes;

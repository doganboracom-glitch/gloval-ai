-- Persist mail subscription access and retry state on the existing domain row.
-- Adding the pending column with TRUE schedules a one-time reconciliation of
-- legacy custom domains; new rows default to FALSE afterwards.
ALTER TABLE public.custom_domains
  ADD COLUMN IF NOT EXISTS mail_access_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS mail_grace_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS mail_grace_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS mail_access_sync_pending boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mail_access_sync_error text,
  ADD COLUMN IF NOT EXISTS mail_quota_mb_per_box integer;

ALTER TABLE public.custom_domains
  ALTER COLUMN mail_access_sync_pending SET DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.custom_domains'::regclass
      AND conname = 'custom_domains_mail_access_status_check'
  ) THEN
    ALTER TABLE public.custom_domains
      ADD CONSTRAINT custom_domains_mail_access_status_check
      CHECK (mail_access_status IN ('active', 'grace', 'suspended'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.custom_domains'::regclass
      AND conname = 'custom_domains_mail_access_sync_error_check'
  ) THEN
    ALTER TABLE public.custom_domains
      ADD CONSTRAINT custom_domains_mail_access_sync_error_check
      CHECK (
        mail_access_sync_error IS NULL
        OR mail_access_sync_error IN ('partial_failure', 'provider_error', 'domain_not_found')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.custom_domains'::regclass
      AND conname = 'custom_domains_mail_quota_mb_per_box_check'
  ) THEN
    ALTER TABLE public.custom_domains
      ADD CONSTRAINT custom_domains_mail_quota_mb_per_box_check
      CHECK (mail_quota_mb_per_box IS NULL OR mail_quota_mb_per_box > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.custom_domains.mail_access_status IS
  'Subscription-derived Mailcow access state: active, grace, or suspended.';
COMMENT ON COLUMN public.custom_domains.mail_access_sync_pending IS
  'True until Mailcow has fully converged to the stored mail access state.';
COMMENT ON COLUMN public.custom_domains.mail_access_sync_error IS
  'Safe error code only; never stores provider messages, credentials, or mailbox data.';
COMMENT ON COLUMN public.custom_domains.mail_quota_mb_per_box IS
  'Last plan quota synchronized to Mailcow, in MiB per mailbox.';

COMMENT ON COLUMN public.custom_domains.mail_grace_started_at IS
  'Start of the current mail-only grace period.';
COMMENT ON COLUMN public.custom_domains.mail_grace_ends_at IS
  'End of the current mail-only grace period.';

-- custom_domains already has RLS and owner policies; no new exposed table is added.
-- No domain, mailbox, alias, or email data is deleted by this migration.

-- On the first application, the TRUE column default marks every existing row
-- for one reconciliation. Subsequent executions do not re-mark completed rows.
ALTER TABLE public.custom_domains
  ALTER COLUMN mail_access_sync_pending SET DEFAULT false;

-- This migration intentionally makes no changes to domain ownership, DNS
-- verification, website binding, or email/mail data deletion.

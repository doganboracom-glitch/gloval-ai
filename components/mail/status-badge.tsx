import { cn } from '@/lib/utils'

/**
 * Shared status pill for every mail surface (domains, mailboxes, logs), so a
 * given state reads identically in the customer view and the admin view.
 */
export type MailStatusTone = 'success' | 'warning' | 'danger' | 'muted'

const TONE: Record<MailStatusTone, string> = {
  success: 'bg-primary/15 text-primary',
  warning: 'bg-accent/15 text-accent',
  danger: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted text-muted-foreground',
}

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: MailStatusTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Maps every provider status onto a tone, keeping colour meaning consistent. */
export const STATUS_TONE = {
  // domains
  active: 'success',
  verifying: 'warning',
  pending: 'warning',
  failed: 'danger',
  // mailboxes
  suspended: 'muted',
  // logs
  delivered: 'success',
  deferred: 'warning',
  bounced: 'danger',
  rejected: 'danger',
} as const satisfies Record<string, MailStatusTone>

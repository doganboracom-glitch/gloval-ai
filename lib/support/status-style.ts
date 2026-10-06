import type { TicketStatus } from '@/lib/support/constants'

export type TicketStatusStyle = {
  /** Pill background, text and ring colours. */
  pill: string
  /** Leading dot, a secondary non-text cue next to the visible label. */
  dot: string
}

/**
 * Single source of truth for support ticket status colours. Keyed by the real
 * `TicketStatus` values so adding a status to `TICKET_STATUSES` fails the
 * type-check until it gets a style here.
 *
 * Light-theme classes come first; the `dark:` variants raise the text lightness
 * and add a visible ring so the pill reads on the dark GLOVAL surfaces.
 */
export const TICKET_STATUS_STYLE: Record<TicketStatus, TicketStatusStyle> = {
  open: {
    pill: 'bg-violet-100 text-violet-800 ring-violet-300 dark:bg-violet-500/20 dark:text-violet-200 dark:ring-violet-400/40',
    dot: 'bg-violet-600 dark:bg-violet-300',
  },
  in_progress: {
    pill: 'bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-500/20 dark:text-sky-200 dark:ring-sky-400/40',
    dot: 'bg-sky-600 dark:bg-sky-300',
  },
  waiting_user: {
    pill: 'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-400/40',
    dot: 'bg-amber-600 dark:bg-amber-300',
  },
  answered: {
    pill: 'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/30',
    dot: 'bg-emerald-600 dark:bg-emerald-300',
  },
  resolved: {
    pill: 'bg-green-200 text-green-900 ring-green-500 dark:bg-green-500/30 dark:text-green-100 dark:ring-green-400/60',
    dot: 'bg-green-700 dark:bg-green-300',
  },
}

const NEUTRAL_STYLE: TicketStatusStyle = {
  pill: 'bg-muted text-muted-foreground ring-border',
  dot: 'bg-muted-foreground',
}

/** Tolerates unexpected values coming from the database instead of throwing. */
export function getTicketStatusStyle(status: string): TicketStatusStyle {
  return (TICKET_STATUS_STYLE as Record<string, TicketStatusStyle | undefined>)[status] ?? NEUTRAL_STYLE
}

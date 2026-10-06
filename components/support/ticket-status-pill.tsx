import { cn } from '@/lib/utils'
import { getTicketStatusStyle } from '@/lib/support/status-style'

/**
 * Presentational support-ticket status badge. It takes an already-translated
 * `label` so it works in both the customer area and the admin panel.
 */
export function TicketStatusPill({
  status,
  label,
  className,
}: {
  status: string
  label: string
  className?: string
}) {
  const style = getTicketStatusStyle(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        style.pill,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', style.dot)} />
      {label}
    </span>
  )
}

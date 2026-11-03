import type { ReactNode } from 'react'
import { DomainPriceView } from '@/components/domains/domain-price'
import type { PricedDomainResult } from '@/lib/custom-domains/pricing/calc'
import type { Dict } from '@/lib/i18n'

const STATUS_STYLE = {
  available: 'bg-emerald-500/10 text-emerald-500',
  unavailable: 'bg-destructive/10 text-destructive',
  unknown: 'bg-muted text-muted-foreground',
} as const

/**
 * One availability row. The price shown is the exact amount charged for a
 * 1-year registration (VAT included), with the net + VAT split underneath.
 */
export function DomainResultCard({
  result,
  locale,
  copy,
  actions,
  badge,
}: {
  result: PricedDomainResult
  locale: string
  copy: Dict['domainSearch']
  actions?: ReactNode
  badge?: ReactNode
}) {
  const statusLabel =
    result.status === 'available' ? copy.statusAvailable : result.status === 'unavailable' ? copy.statusTaken : copy.statusUnknown
  const quote = result.status === 'available' ? result.quote : null

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="break-all font-mono text-base font-semibold sm:text-lg">{result.domain}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[result.status]}`}>
            {statusLabel}
          </span>
          {badge}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:items-end">
        {result.status === 'available' &&
          (quote ? (
            <DomainPriceView quote={quote} locale={locale} copy={copy} periodLabel={copy.perYear} align="end" />
          ) : (
            <p className="text-sm text-muted-foreground">{copy.priceUnavailable}</p>
          ))}
        {actions}
      </div>
    </li>
  )
}

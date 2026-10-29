import type { ReactNode } from 'react'
import { fill } from '@/components/domains/domain-chrome'
import type { PricedDomainResult } from '@/lib/custom-domains/pricing/calc'
import type { Dict } from '@/lib/i18n'

export function formatTry(minor: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY' }).format(minor / 100)
  } catch {
    return `${(minor / 100).toFixed(2)} TRY`
  }
}

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
            <div className="sm:text-right">
              <p className="font-display text-xl font-semibold tabular-nums">{formatTry(quote.grossMinor, locale)}</p>
              <p className="text-xs text-muted-foreground">
                {copy.perYear} · {copy.vatIncluded}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {fill(copy.vatBreakdown, {
                  net: formatTry(quote.netMinor, locale),
                  rate: quote.vatBps / 100,
                })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{copy.priceUnavailable}</p>
          ))}
        {actions}
      </div>
    </li>
  )
}

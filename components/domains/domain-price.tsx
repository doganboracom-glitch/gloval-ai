'use client'

import { cn } from '@/lib/utils'
import { fill } from '@/components/domains/domain-chrome'
import type { Dict } from '@/lib/i18n'
import type { PricedDomainResult } from '@/lib/custom-domains/pricing/calc'

type DomainQuote = NonNullable<PricedDomainResult['quote']>

type DomainPriceViewProps = {
  quote: DomainQuote
  locale: string
  copy: Dict['domainSearch']
  periodLabel?: string
  density?: 'default' | 'compact'
  align?: 'start' | 'end'
  className?: string
}

export function formatDomainMoney(minor: number, currency: string, locale: string): string {
  if (!Number.isFinite(minor)) return '—'
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100)
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`
  }
}

export function DomainPriceView({
  quote,
  locale,
  copy,
  periodLabel = copy.perYear,
  density = 'default',
  align = 'start',
  className,
}: DomainPriceViewProps) {
  return (
    <div className={cn('flex flex-col gap-0.5', align === 'end' && 'text-right', className)}>
      <p className={cn('font-semibold tabular-nums text-foreground', density === 'compact' ? 'text-sm' : 'text-lg')}>
        {formatDomainMoney(quote.grossMinor, quote.currency, locale)}
      </p>
      <p className="text-xs text-muted-foreground">
        {periodLabel} · {copy.vatIncluded}
      </p>
      <p className="text-xs text-muted-foreground">
        {fill(copy.vatBreakdown, {
          net: formatDomainMoney(quote.netMinor, quote.currency, locale),
          rate: quote.vatBps / 100,
        })}
      </p>
    </div>
  )
}

'use client'

import { Check } from 'lucide-react'
import { PUBLIC_SEARCH_TLDS, type PublicSearchTld } from '@/lib/custom-domains/public-search/validate'

export function DomainTldChips({
  label,
  selected,
  onToggle,
}: {
  label: string
  selected: readonly PublicSearchTld[]
  onToggle: (tld: PublicSearchTld) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground" aria-hidden="true">
        {label}
      </span>
      {PUBLIC_SEARCH_TLDS.map((tld) => {
        const active = selected.includes(tld)
        return (
          <button
            key={tld}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(tld)}
            className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 font-mono text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              active
                ? 'border-brand/50 bg-brand/15 text-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {active && <Check className="size-3.5 text-brand" aria-hidden="true" />}.{tld}
          </button>
        )
      })}
    </div>
  )
}

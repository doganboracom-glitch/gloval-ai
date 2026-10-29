'use client'

import { Gauge } from 'lucide-react'
import { fill } from '@/components/domains/domain-chrome'
import { scoreDomainQuality } from '@/lib/domains/quality-score'
import { BAND_TEXT_CLASS } from '@/lib/domains/quality-score-copy'
import type { Dict } from '@/lib/i18n'

export function QualityScoreBadge({
  domain,
  copy,
  onOpen,
}: {
  domain: string
  copy: Dict['domainSearch']
  onOpen: (domain: string) => void
}) {
  const result = scoreDomainQuality(domain)
  if (!result.ok) return null

  return (
    <button
      type="button"
      onClick={() => onOpen(domain)}
      aria-label={fill(copy.qsBadgeAria, { domain, score: result.total })}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <Gauge className={`size-3.5 ${BAND_TEXT_CLASS[result.band]}`} aria-hidden="true" />
      {copy.qsBadgeLabel}
      <span className="tabular-nums text-foreground">{result.total}</span>
    </button>
  )
}

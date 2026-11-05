'use client'

import { Search } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const MAX_SHOWN_HEADLINES = 3
const MAX_SHOWN_DESCRIPTIONS = 2

export function AiSuggestionBadge({ className }: { className?: string }) {
  const { lang } = useLanguage()
  return (
    <Badge variant="outline" data-ai-badge className={cn('border-brand/40 px-1.5 py-0 text-[0.7rem] font-medium text-brand', className)}>
      {lang === 'tr' ? 'AI önerisi' : 'AI suggestion'}
    </Badge>
  )
}

function readableUrl(displayUrl: string, finalUrl: string): string {
  const value = displayUrl.trim() || finalUrl.trim()
  return value.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

/** A Google search ad as it would read in results; follows the form live. */
export function GoogleAdsSearchPreview({
  headlines,
  descriptions,
  displayUrl,
  finalUrl,
  keywords,
}: {
  headlines: string[]
  descriptions: string[]
  displayUrl: string
  finalUrl: string
  keywords: string[]
}) {
  const { lang } = useLanguage()
  const isTr = lang === 'tr'
  const title = headlines.slice(0, MAX_SHOWN_HEADLINES).join(' | ')
  const shownDescriptions = descriptions.slice(0, MAX_SHOWN_DESCRIPTIONS)
  const url = readableUrl(displayUrl, finalUrl)
  const empty = !title && shownDescriptions.length === 0

  return (
    <section
      aria-labelledby="google-ads-preview-title"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="google-ads-preview-title" className="text-sm font-semibold">
          {isTr ? 'Reklam önizlemesi' : 'Ad preview'}
        </h3>
        <span className="text-xs text-muted-foreground">{isTr ? 'Google arama sonuçları' : 'Google search results'}</span>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate" data-testid="preview-query">{keywords[0] ?? (isTr ? 'anahtar kelime' : 'keyword')}</span>
      </div>
      {empty ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm leading-relaxed text-muted-foreground">
          {isTr
            ? 'Plan oluşturulunca ya da başlık eklediğinizde reklamınız burada görünür.'
            : 'Your ad appears here once a plan is generated or you add a headline.'}
        </p>
      ) : (
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-background p-4" data-testid="ad-preview">
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{isTr ? 'Sponsorlu' : 'Sponsored'}</span>
            <span aria-hidden="true">·</span>
            <span className="break-all">{url}</span>
          </p>
          <p className="text-pretty text-lg font-medium leading-snug text-brand" data-testid="preview-headline">{title}</p>
          {shownDescriptions.map((line) => (
            <p key={line} className="text-sm leading-relaxed text-foreground">{line}</p>
          ))}
        </div>
      )}
    </section>
  )
}

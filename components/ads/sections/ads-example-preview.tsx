'use client'

import { Search } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'

export function AdsExamplePreviewSection() {
  const { t } = useLanguage()
  const copy = t.ads.sections.preview

  return (
    <section aria-labelledby="ads-example-heading" className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
      <div className="mb-6 flex flex-col gap-2">
        <h2 id="ads-example-heading" className="text-balance text-2xl font-semibold tracking-tight">
          {copy.title}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{copy.intro}</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-muted-foreground">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span>{copy.searchQuery}</span>
        </div>
        <article aria-label={copy.sampleLabel} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="rounded border border-border px-1.5 py-0.5 text-xs font-medium text-foreground">
              {copy.sponsoredLabel}
            </span>
            <span className="break-all text-muted-foreground">{copy.displayUrl}</span>
          </div>
          <h3 className="text-lg font-medium leading-snug text-brand">{copy.headline}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-sm text-brand">
            <span>{copy.sitelinkServices}</span>
            <span>{copy.sitelinkContact}</span>
          </div>
        </article>
      </div>
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">{copy.disclaimer}</p>
    </section>
  )
}

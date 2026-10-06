'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { FaqAccordion } from '@/components/content/faq-accordion'
import { getFaqItems } from '@/lib/content/faq'
import { getLocalized } from '@/lib/content/types'

export function FaqPageClient() {
  const { t, lang } = useLanguage()
  const [query, setQuery] = useState('')
  const allItems = getFaqItems()

  // Filter across both question and answer text: people often remember a phrase
  // from the answer ("DNS", "iade") rather than the question wording.
  const items = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-US')
    if (!q) return allItems
    return allItems.filter((item) => {
      const haystack = `${getLocalized(item.question, lang)} ${getLocalized(item.answer, lang)}`.toLocaleLowerCase(
        lang === 'tr' ? 'tr-TR' : 'en-US',
      )
      return haystack.includes(q)
    })
  }, [allItems, query, lang])

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t.nav.backHome}
        </a>

        <header className="mt-8 text-center">
          <h1 className="text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {t.faq.pageTitle}
          </h1>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            {t.faq.pageSubtitle}
          </p>
        </header>

        <div className="relative mt-10">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t.faq.searchLabel}
            placeholder={t.faq.searchPlaceholder}
            className="h-12 w-full rounded-xl border border-border bg-card pl-11 pr-11 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t.faq.clearSearch}
              className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="mt-8">
          {items.length > 0 ? (
            // Collapsed by default while searching so matches are scannable as
            // a list rather than one long expanded answer.
            <FaqAccordion items={items} defaultOpen={query ? null : 0} />
          ) : (
            <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center">
              <p className="text-sm text-muted-foreground">{t.faq.noResults}</p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold transition-colors hover:bg-secondary/60"
              >
                {t.faq.clearSearch}
              </button>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

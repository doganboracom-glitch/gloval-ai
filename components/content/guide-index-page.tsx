import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { HelpCenterTabs } from '@/components/content/help-center-tabs'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import {
  GUIDE_CATEGORY_LABELS,
  GUIDE_CATEGORY_ORDER,
  GUIDE_PAGE_COPY,
  GUIDES,
  guideHref,
  type GuideLocale,
} from '@/lib/content/guides'

export function GuideIndexPage({ locale }: { locale: GuideLocale }) {
  const copy = GUIDE_PAGE_COPY[locale]

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
        <HelpCenterTabs active="guides" locale={locale} />

        <header className="mx-auto mt-10 max-w-2xl text-center">
          <h1 className="text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {copy.indexTitle}
          </h1>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            {copy.indexDescription}
          </p>
        </header>

        <div className="mt-12 flex flex-col gap-12">
          {GUIDE_CATEGORY_ORDER.map((category) => {
            const categoryGuides = GUIDES.filter((guide) => guide.category === category)

            return (
              <section key={category} aria-labelledby={`guide-category-${category}`}>
                <h2
                  id={`guide-category-${category}`}
                  className="mb-5 text-2xl font-semibold tracking-tight"
                >
                  {GUIDE_CATEGORY_LABELS[locale][category]}
                </h2>
                <ul className="grid list-none gap-4 sm:grid-cols-2">
                  {categoryGuides.map((guide) => {
                    const content = guide.content[locale]

                    return (
                      <li key={guide.slug}>
                        <Link
                          href={guideHref(guide.slug, locale)}
                          className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-brand/40 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="flex items-center justify-between gap-4">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {GUIDE_CATEGORY_LABELS[locale][category]}
                            </span>
                            <ArrowRight
                              aria-hidden="true"
                              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground"
                            />
                          </span>
                          <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
                            {content.title}
                          </h3>
                          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                            {content.description}
                          </p>
                          <span className="mt-5 text-sm font-semibold text-primary">
                            {locale === 'tr' ? 'Rehberi aç' : 'Read guide'}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

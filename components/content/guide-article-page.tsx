import Link from 'next/link'
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react'
import { HelpCenterTabs } from '@/components/content/help-center-tabs'
import { LinkButton } from '@/components/link-button'
import { cn } from '@/lib/utils'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import {
  GUIDE_CATEGORY_LABELS,
  GUIDE_CATEGORY_ORDER,
  GUIDE_PAGE_COPY,
  GUIDES,
  guideHref,
  localizedGuideHref,
  type Guide,
  type GuideLocale,
} from '@/lib/content/guides'
import { buildGuideArticleJsonLd } from '@/lib/seo/guide-seo'

function GuideCategoryNavigation({ guide, locale }: { guide: Guide; locale: GuideLocale }) {
  const copy = GUIDE_PAGE_COPY[locale]

  return (
    <aside className="min-w-0">
      <details className="group rounded-xl border border-border bg-card md:hidden">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground marker:text-muted-foreground">
          <span>
            {copy.mobileMenuLabel}: {GUIDE_CATEGORY_LABELS[locale][guide.category]}
          </span>
        </summary>
        <nav aria-label={copy.mobileMenuLabel} className="border-t border-border p-4">
          <GuideLinks guide={guide} locale={locale} />
        </nav>
      </details>

      <nav aria-label={copy.mobileMenuLabel} className="hidden md:block">
        <GuideLinks guide={guide} locale={locale} />
      </nav>
    </aside>
  )
}

function GuideLinks({ guide, locale }: { guide: Guide; locale: GuideLocale }) {
  return (
    <div className="flex flex-col gap-6">
      {GUIDE_CATEGORY_ORDER.map((category) => (
        <section key={category}>
          <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {GUIDE_CATEGORY_LABELS[locale][category]}
          </h2>
          <ul className="flex list-none flex-col gap-1">
            {GUIDES.filter((item) => item.category === category).map((item) => {
              const isCurrent = item.slug === guide.slug

              return (
                <li key={item.slug}>
                  <Link
                    href={guideHref(item.slug, locale)}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={cn(
                      'block rounded-lg px-3 py-2 text-sm leading-relaxed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isCurrent
                        ? 'bg-brand/10 font-semibold text-brand'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    {item.content[locale].title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function GuideArticlePage({ guide, locale }: { guide: Guide; locale: GuideLocale }) {
  const copy = GUIDE_PAGE_COPY[locale]
  const content = guide.content[locale]
  const currentIndex = GUIDES.findIndex((item) => item.slug === guide.slug)
  const previous = GUIDES[currentIndex - 1]
  const next = GUIDES[currentIndex + 1]
  const structuredData = buildGuideArticleJsonLd(guide, locale)

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-12">
        <nav aria-label={locale === 'tr' ? 'İçerik yolu' : 'Breadcrumb'}>
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <li>
              <Link className="transition-colors hover:text-foreground" href="/">
                {copy.breadcrumbHome}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="size-4" />
            </li>
            <li>
              <Link
                className="transition-colors hover:text-foreground"
                href={localizedGuideHref('/sss', locale)}
              >
                {copy.breadcrumbHelp}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="size-4" />
            </li>
            <li>
              <Link
                className="transition-colors hover:text-foreground"
                href={localizedGuideHref('/sss/rehber', locale)}
              >
                {copy.breadcrumbGuides}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="size-4" />
            </li>
            <li aria-current="page" className="max-w-full truncate text-foreground">
              {content.title}
            </li>
          </ol>
        </nav>

        <div className="mt-8">
          <HelpCenterTabs active="guides" locale={locale} />
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-12">
          <GuideCategoryNavigation guide={guide} locale={locale} />

          <article className="min-w-0">
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
              }}
            />
            <header className="max-w-3xl">
              <p className="text-sm font-semibold text-primary">
                {GUIDE_CATEGORY_LABELS[locale][guide.category]}
              </p>
              <h1 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {content.title}
              </h1>
              <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
                {content.description}
              </p>
            </header>

            <div className="mt-10 flex max-w-3xl flex-col gap-8">
              {content.sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                    {section.heading}
                  </h2>
                  {section.paragraphs.length > 0 && (
                    <div className="mt-4 flex flex-col gap-4 text-base leading-relaxed text-muted-foreground">
                      {section.paragraphs.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  )}
                  {section.steps && section.steps.length > 0 && (
                    <ol className="mt-5 flex list-none flex-col gap-4">
                      {section.steps.map((step, index) => (
                        <li key={step.title} className="flex gap-4">
                          <span
                            aria-hidden="true"
                            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground"
                          >
                            {index + 1}
                          </span>
                          <div className="flex min-w-0 flex-col gap-1">
                            <h3 className="font-semibold text-foreground">{step.title}</h3>
                            <p className="text-base leading-relaxed text-muted-foreground">
                              {step.description}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              ))}
            </div>

            <nav
              aria-label={locale === 'tr' ? 'Rehber gezinme' : 'Guide navigation'}
              className="mt-12 flex items-stretch justify-between gap-4 border-t border-border pt-6"
            >
              {previous ? (
                <Link
                  href={guideHref(previous.slug, locale)}
                  className="group flex min-w-0 items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeft aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs font-semibold text-muted-foreground">{copy.previous}</span>
                    <span className="truncate text-sm font-medium text-foreground">
                      {previous.content[locale].title}
                    </span>
                  </span>
                </Link>
              ) : (
                <span aria-hidden="true" />
              )}
              {next ? (
                <Link
                  href={guideHref(next.slug, locale)}
                  className="group flex min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-right transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs font-semibold text-muted-foreground">{copy.next}</span>
                    <span className="truncate text-sm font-medium text-foreground">
                      {next.content[locale].title}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ) : (
                <span aria-hidden="true" />
              )}
            </nav>

            <section className="mt-10 flex flex-col gap-5 rounded-2xl border border-border bg-secondary/50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="max-w-xl">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {copy.ctaTitle}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {copy.ctaDescription}
                </p>
              </div>
              <LinkButton
                href="/auth/sign-up"
                variant="brand"
                size="lg"
                className="shrink-0"
              >
                {copy.ctaButton}
                <ArrowRight aria-hidden="true" className="size-4" />
              </LinkButton>
            </section>
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}


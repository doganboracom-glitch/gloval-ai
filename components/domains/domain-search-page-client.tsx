'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Globe } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { PublicDomainSearch, type SearchRequest } from '@/components/domains/public-domain-search'
import { DomainQualityScore, type ScoreSeed } from '@/components/domains/domain-quality-score'
import { DomainWhySection } from '@/components/domains/domain-why-section'
import { DomainChooseGuide } from '@/components/domains/domain-choose-guide'
import { DomainPurchaseSteps } from '@/components/domains/domain-purchase-steps'
import { WHOIS_LOOKUP_ENABLED, WHOIS_LOOKUP_PATH } from '@/lib/domains/feature-flags'

export function DomainSearchPageClient({
  open,
  authenticated,
  initialQuery,
}: {
  open: boolean
  authenticated: boolean
  initialQuery: string
}) {
  const { t } = useLanguage()
  const copy = t.domainSearch
  const [scoreSeed, setScoreSeed] = useState<ScoreSeed | null>(null)
  const [searchRequest, setSearchRequest] = useState<SearchRequest | null>(null)

  function openScore(domain: string) {
    setScoreSeed({ domain, nonce: Date.now() })
    document.getElementById('domain-quality-score')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function requestSearch(query: string) {
    setSearchRequest({ query, nonce: Date.now() })
    document.getElementById('domain-search-input')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const faq = [
    { q: copy.faqPeriodQ, a: copy.faqPeriodA },
    { q: copy.faqWhoisQ, a: copy.faqWhoisA },
    { q: copy.faqConnectQ, a: copy.faqConnectA },
  ]

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t.nav.backHome}
        </Link>

        <header className="mt-8 max-w-3xl">
          <Globe className="size-8 text-brand" aria-hidden="true" />
          <h1 className="mt-4 text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {open ? copy.title : copy.comingSoonTitle}
          </h1>
          <p className="mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            {open ? copy.subtitle : copy.comingSoonBody}
          </p>
          {open && (
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {[copy.trust1, copy.trust2, copy.trust3].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </header>

        {open && (
          <div className="mt-10 max-w-3xl">
            <PublicDomainSearch
              authenticated={authenticated}
              initialQuery={initialQuery}
              request={searchRequest}
              onOpenScore={openScore}
            />
          </div>
        )}

        {open && (
          <div className="mt-16 flex flex-col gap-16">
            <DomainWhySection copy={copy} />
            <DomainQualityScore seed={scoreSeed} onSearch={requestSearch} />
            <DomainChooseGuide copy={copy} />
            <DomainPurchaseSteps copy={copy} />
            {WHOIS_LOOKUP_ENABLED && (
              <p className="text-sm text-muted-foreground">
                {copy.whoisPrompt}{' '}
                <Link href={WHOIS_LOOKUP_PATH} className="text-brand underline-offset-4 hover:underline">
                  {copy.whoisLink}
                </Link>
              </p>
            )}
          </div>
        )}

        <section className="mt-16 max-w-3xl" aria-labelledby="domain-faq-title">
          <h2 id="domain-faq-title" className="font-display text-xl font-semibold">
            {copy.faqTitle}
          </h2>
          <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
            {faq.map((item) => (
              <div key={item.q} className="px-5 py-4">
                <dt className="font-medium">{item.q}</dt>
                <dd className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
              </div>
            ))}
            <div className="px-5 py-4">
              <dt className="font-medium">{copy.faqRefundQ}</dt>
              <dd className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
                {copy.faqRefundA}{' '}
                <Link href="/yasal/mesafeli-satis-sozlesmesi" className="text-brand underline-offset-4 hover:underline">
                  {copy.distanceSalesLink}
                </Link>
                {' · '}
                <Link href="/yasal/iptal-ve-iade" className="text-brand underline-offset-4 hover:underline">
                  {copy.refundLink}
                </Link>
              </dd>
            </div>
          </dl>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

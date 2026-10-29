'use client'

import Link from 'next/link'
import { ArrowLeft, Globe } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { PublicDomainSearch } from '@/components/domains/public-domain-search'

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
  const faq = [
    { q: copy.faqPeriodQ, a: copy.faqPeriodA },
    { q: copy.faqWhoisQ, a: copy.faqWhoisA },
    { q: copy.faqConnectQ, a: copy.faqConnectA },
  ]

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t.nav.backHome}
        </Link>

        <header className="mt-8">
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
          <div className="mt-10">
            <PublicDomainSearch authenticated={authenticated} initialQuery={initialQuery} />
          </div>
        )}

        <section className="mt-16" aria-labelledby="domain-faq-title">
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

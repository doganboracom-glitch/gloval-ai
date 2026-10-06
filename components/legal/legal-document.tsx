'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/components/language-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { LEGAL_LAST_UPDATED } from '@/lib/legal/company'
import type { LegalDoc } from '@/lib/legal/documents'

/**
 * Tüm yasal doküman sayfaları için ortak kabuk. İçerik `lib/legal/documents.ts`
 * içinde yapısal olarak tutulur; burada yalnızca sunum yapılır. Sayfa başlığı,
 * geri bağlantısı ve footer mevcut i18n sözlüğünden gelir.
 */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  const { t, lang } = useLanguage()

  // Pick the active-language content; the doc holds both `tr` and `en`.
  const content = lang === 'en' ? doc.en : doc.tr

  const updatedLabel =
    lang === 'tr' ? 'Son güncelleme' : 'Last updated'
  const updated = new Date(LEGAL_LAST_UPDATED).toLocaleDateString(
    lang === 'tr' ? 'tr-TR' : 'en-US',
    { year: 'numeric', month: 'long', day: 'numeric' },
  )

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t.nav.backHome}
        </Link>

        <header className="mt-8 border-b border-border pb-8">
          <h1 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {content.title}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {updatedLabel}: {updated}
          </p>
          {content.intro.map((para, i) => (
            <p
              key={i}
              className="mt-4 text-pretty leading-relaxed text-muted-foreground"
            >
              {para}
            </p>
          ))}
        </header>

        <article className="mt-10 space-y-10">
          {content.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {section.heading}
              </h2>
              <div className="mt-4 space-y-4">
                {section.blocks.map((block, i) =>
                  block.type === 'p' ? (
                    <p
                      key={i}
                      className="text-pretty leading-relaxed text-muted-foreground"
                    >
                      {block.text}
                    </p>
                  ) : (
                    <ul key={i} className="space-y-2 pl-1">
                      {block.items.map((item, j) => (
                        <li
                          key={j}
                          className="flex gap-3 text-pretty leading-relaxed text-muted-foreground"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ),
                )}
              </div>
            </section>
          ))}
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}

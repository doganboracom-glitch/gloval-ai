'use client'

import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/components/language-provider'

export function AdsFaqSection() {
  const { t } = useLanguage()
  const copy = t.ads.sections.faq

  return (
    <section aria-labelledby="ads-faq-heading" className="mx-auto max-w-5xl px-4 py-10 pb-16 sm:py-12 sm:pb-20">
      <h2 id="ads-faq-heading" className="mb-4 text-balance text-2xl font-semibold tracking-tight">
        {copy.title}
      </h2>
      <div className="max-w-3xl divide-y divide-border border-y border-border">
        {copy.items.map((item) => (
          <details key={item.question} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
              <span>{item.question}</span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="pb-4 pr-8 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
            {'privacyLinkLabel' in item ? (
              <Link
                href="/yasal/gizlilik-politikasi"
                className="mb-4 inline-flex text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              >
                {item.privacyLinkLabel}
              </Link>
            ) : null}
          </details>
        ))}
      </div>
      <aside
        aria-labelledby="ads-support-line"
        className="mt-6 flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <p id="ads-support-line" className="text-sm leading-relaxed text-muted-foreground">
          {copy.supportText}
        </p>
        <Link
          href="/yasal/iletisim"
          className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border/70 bg-card/40 px-4 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:w-auto"
        >
          {copy.supportButton}
        </Link>
      </aside>
    </section>
  )
}

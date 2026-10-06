'use client'

import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { SectionHeading } from '@/components/features'
import { FaqAccordion } from '@/components/content/faq-accordion'
import { getFeaturedFaqItems } from '@/lib/content/faq'

/**
 * Homepage FAQ summary: the curated `featured` subset (7 items), with a link
 * through to the full /sss page.
 */
export function Faq() {
  const { t } = useLanguage()
  const items = getFeaturedFaqItems()

  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:py-28">
      <SectionHeading title={t.faq.title} subtitle={t.faq.subtitle} />

      <div className="mt-10">
        <FaqAccordion items={items} />
      </div>

      <div className="mt-8 flex justify-center">
        <a
          href="/sss"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-5 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t.faq.viewAll}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}

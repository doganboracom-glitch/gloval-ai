'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { SectionHeading } from '@/components/features'
import { DemoPreviewFrame } from '@/components/demo-preview-frame'
import { demos } from '@/lib/demos'
import { pickLang, toBilingual } from '@/lib/i18n'

export function Showcase() {
  const { t, lang } = useLanguage()

  const demoBadge = lang === 'tr' ? 'Demo çalışma' : 'Demo project'
  const cta = lang === 'tr' ? 'Siteyi incele' : 'View site'

  return (
    <section id="showcase" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:py-28">
      <SectionHeading title={t.showcase.title} subtitle={t.showcase.subtitle} />

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {demos.map((demo) => (
          <Link
            key={demo.slug}
            href={`/demo/${demo.slug}${lang === 'en' ? '?lang=en' : ''}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/50"
          >
            <div className="relative aspect-[4/3] overflow-hidden border-b border-border">
              <DemoPreviewFrame
                slug={demo.slug}
                lang={toBilingual(lang)}
                title={`${pickLang(demo.brand, lang)} — ${pickLang(demo.description, lang)}`}
              />
              <span className="pointer-events-none absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                {demoBadge}
              </span>
            </div>

            <div className="flex flex-1 flex-col p-4">
              <span className="inline-block w-fit rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-medium text-primary">
                {pickLang(demo.tag, lang)}
              </span>
              <h3 className="mt-2 font-display text-base font-semibold text-foreground">
                {pickLang(demo.brand, lang)}
              </h3>
              <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
                {pickLang(demo.description, lang)}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                {cta}
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

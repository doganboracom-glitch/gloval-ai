'use client'

import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { LinkButton } from '@/components/link-button'

export function FinalCta() {
  const { t } = useLanguage()

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-card px-6 py-16 text-center">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
        <div className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-primary/25 blur-[110px]" />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-balance font-display text-3xl font-bold tracking-tight sm:text-5xl">
            {t.finalCta.title}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-pretty text-muted-foreground">
            {t.finalCta.subtitle}
          </p>
          <LinkButton href="#hero-input" size="lg" className="mt-8">
            {t.finalCta.button}
            <ArrowRight className="ml-1 h-4 w-4" />
          </LinkButton>
        </div>
      </div>
    </section>
  )
}

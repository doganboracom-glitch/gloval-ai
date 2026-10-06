'use client'

import { useLanguage } from '@/components/language-provider'
import { SectionHeading } from '@/components/features'
import { cn } from '@/lib/utils'

export function HowItWorks() {
  const { t } = useLanguage()
  const steps = t.how.steps

  return (
    <section
      id="how"
      className="scroll-mt-20 border-y border-border bg-secondary/20 py-16 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading title={t.how.title} subtitle={t.how.subtitle} />

        <div className="mt-10 grid gap-4 sm:mt-14 sm:gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className={cn(
                'group relative flex flex-col rounded-2xl border border-brand/20 bg-gradient-to-b from-card to-card/60 p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-colors duration-300 sm:p-7',
                'hover:border-brand/60',
              )}
            >
              <span className="font-display text-4xl font-semibold tracking-tight text-foreground/15 tabular-nums sm:text-5xl">
                0{i + 1}
              </span>

              <div className="mt-4 h-px w-8 bg-border" />

              <h3 className="mt-4 font-display text-lg font-semibold leading-snug text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

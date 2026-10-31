'use client'

import { useLanguage } from '@/components/language-provider'
import { cn } from '@/lib/utils'

export function AdsHowItWorksSection() {
  const { t } = useLanguage()
  const copy = t.ads.sections.how
  const stepGroups = [copy.steps.slice(0, 1), copy.steps.slice(1, 3), copy.steps.slice(3)]

  return (
    <section aria-labelledby="ads-how-heading" className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
      <div className="mb-6 flex flex-col gap-2">
        <h2 id="ads-how-heading" className="text-balance text-2xl font-semibold tracking-tight">
          {copy.title}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{copy.intro}</p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {stepGroups.map((steps, index) => {
          const badge = steps.find((step) => step.badge)?.badge

          return (
            <li
              key={steps.map((step) => step.title).join('-')}
              className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-brand/30 bg-brand/10 text-sm font-semibold text-brand"
                >
                  {index + 1}
                </span>
                {badge ? (
                  <span className="rounded-full border border-border/70 bg-secondary/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {badge}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-3">
                {steps.map((step, stepIndex) => (
                  <div
                    key={step.title}
                    className={cn('flex flex-col gap-1.5', stepIndex > 0 && 'border-t border-border/70 pt-3')}
                  >
                    <h3 className="text-base font-semibold leading-snug">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  </div>
                ))}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

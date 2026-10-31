'use client'

import { useLanguage } from '@/components/language-provider'

export function AdsHowItWorksSection() {
  const { t } = useLanguage()
  const copy = t.ads.sections.how

  return (
    <section aria-labelledby="ads-how-heading" className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
      <div className="mb-6 flex flex-col gap-2">
        <h2 id="ads-how-heading" className="text-balance text-2xl font-semibold tracking-tight">
          {copy.title}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{copy.intro}</p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {copy.steps.map((step, index) => (
          <li key={step.title} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-foreground"
              >
                {index + 1}
              </span>
              {step.badge ? (
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {step.badge}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

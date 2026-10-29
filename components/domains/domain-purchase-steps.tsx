import type { Dict } from '@/lib/i18n'

export function DomainPurchaseSteps({ copy }: { copy: Dict['domainSearch'] }) {
  const steps = [
    [copy.step1Title, copy.step1Body],
    [copy.step2Title, copy.step2Body],
    [copy.step3Title, copy.step3Body],
    [copy.step4Title, copy.step4Body],
    [copy.step5Title, copy.step5Body],
    [copy.step6Title, copy.step6Body],
  ]

  return (
    <section aria-labelledby="domain-steps-title">
      <h2 id="domain-steps-title" className="font-display text-2xl font-semibold tracking-tight">
        {copy.stepsTitle}
      </h2>
      <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{copy.stepsSubtitle}</p>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map(([title, body], index) => (
          <li key={title} className="flex gap-4 rounded-xl border border-border bg-card p-5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 font-display text-sm font-semibold text-brand"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <div>
              <h3 className="font-display text-base font-semibold">{title}</h3>
              <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

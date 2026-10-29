import { Lightbulb } from 'lucide-react'
import type { Dict } from '@/lib/i18n'

export function DomainChooseGuide({ copy }: { copy: Dict['domainSearch'] }) {
  const items = [
    [copy.choose1Title, copy.choose1Body],
    [copy.choose2Title, copy.choose2Body],
    [copy.choose3Title, copy.choose3Body],
    [copy.choose4Title, copy.choose4Body],
    [copy.choose5Title, copy.choose5Body],
    [copy.choose6Title, copy.choose6Body],
    [copy.choose7Title, copy.choose7Body],
    [copy.choose8Title, copy.choose8Body],
    [copy.choose9Title, copy.choose9Body],
    [copy.choose10Title, copy.choose10Body],
  ]

  return (
    <section aria-labelledby="domain-choose-title">
      <h2 id="domain-choose-title" className="font-display text-2xl font-semibold tracking-tight">
        {copy.chooseTitle}
      </h2>
      <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">{copy.chooseSubtitle}</p>
      <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {items.map(([title, body]) => (
          <div key={title} className="border-t border-border pt-4">
            <dt className="font-medium">{title}</dt>
            <dd className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">{body}</dd>
          </div>
        ))}
      </dl>
      <aside className="mt-6 flex gap-3 rounded-xl border border-brand/30 bg-brand/10 p-4">
        <Lightbulb className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
        <div>
          <p className="font-display text-sm font-semibold">{copy.chooseTipTitle}</p>
          <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">{copy.chooseTipBody}</p>
        </div>
      </aside>
      <p className="mt-3 text-pretty text-xs leading-relaxed text-muted-foreground">{copy.chooseLegal}</p>
    </section>
  )
}

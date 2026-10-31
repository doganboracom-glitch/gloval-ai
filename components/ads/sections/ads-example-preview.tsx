'use client'

import { Search } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import styles from './ads-example-preview.module.css'

type CalloutListProps = {
  items: string[]
  label: string
  className: string
  connectorClassName: string
}

function CalloutList({ items, label, className, connectorClassName }: CalloutListProps) {
  return (
    <ul aria-label={label} className={className}>
      {items.map((item) => (
        <li
          key={item}
          className={`${styles.callout} relative min-w-0 break-words rounded-xl border border-border/70 bg-card/70 p-3 text-sm leading-5 text-foreground shadow-sm backdrop-blur-sm`}
        >
          <span aria-hidden="true" className={connectorClassName} />
          {item}
        </li>
      ))}
    </ul>
  )
}

export function AdsExamplePreviewSection() {
  const { t } = useLanguage()
  const copy = t.ads.sections.preview
  const leftCallouts = copy.callouts.slice(0, 3)
  const rightCallouts = copy.callouts.slice(3)

  return (
    <section aria-labelledby="ads-example-heading" className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <div className={`${styles.previewShell} rounded-3xl p-4 sm:p-8`}>
        <div className="relative z-10">
          <div className="mb-7 flex flex-col gap-2">
            <h2 id="ads-example-heading" className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              {copy.title}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{copy.intro}</p>
          </div>
          <div className="grid min-w-0 items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)_minmax(0,1fr)] md:gap-6">
            <CalloutList
              items={leftCallouts}
              label={copy.calloutsLabel}
              className={`${styles.leftCallouts} hidden min-w-0 flex-col gap-3 md:flex`}
              connectorClassName={styles.connectorRight}
            />
            <article
              aria-label={copy.sampleLabel}
              className={`${styles.previewCard} min-w-0 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-xl backdrop-blur-xl sm:p-5`}
            >
              <div className="mb-4 flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
                <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 break-words text-sm text-muted-foreground">{copy.searchQuery}</span>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-border bg-background/80 px-2 py-1 text-xs font-medium text-foreground">
                    {copy.sponsoredLabel}
                  </span>
                  <span className="rounded-md bg-brand/10 px-2 py-1 text-xs font-medium text-brand">
                    {copy.sampleLabel}
                  </span>
                </div>
                <p className="break-all text-xs text-muted-foreground">{copy.displayUrl}</p>
                <h3 className="text-pretty text-lg font-semibold leading-snug text-brand sm:text-xl">
                  {copy.headlineOne}
                  <span aria-hidden="true" className="px-1.5 text-muted-foreground">
                    |
                  </span>
                  {copy.headlineTwo}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1 text-sm text-brand">
                  <span className="underline underline-offset-2">{copy.sitelinkServices}</span>
                  <span className="underline underline-offset-2">{copy.sitelinkContact}</span>
                </div>
              </div>
            </article>
            <CalloutList
              items={rightCallouts}
              label={copy.calloutsLabel}
              className={`${styles.rightCallouts} hidden min-w-0 flex-col gap-3 md:flex`}
              connectorClassName={styles.connectorLeft}
            />
          </div>
          <ul aria-label={copy.calloutsLabel} className={`${styles.mobileCallouts} mt-5 grid gap-2 sm:grid-cols-2 md:hidden`}>
            {copy.callouts.map((item) => (
              <li
                key={item}
                className={`${styles.callout} flex min-w-0 items-start gap-2 rounded-lg border border-border/70 bg-card/70 px-3 py-2.5 text-sm leading-relaxed text-foreground backdrop-blur-sm`}
              >
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brand/70" />
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex min-w-0 flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">{copy.keywordLabel}</p>
              <ul aria-label={copy.keywordLabel} className="flex min-w-0 flex-wrap gap-2">
                {copy.keywords.map((keyword) => (
                  <li key={keyword} className="max-w-full break-words rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs text-foreground">
                    {keyword}
                  </li>
                ))}
              </ul>
            </div>
            <p className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-muted-foreground">{copy.sampleBudgetLabel}:</span>
              <strong className="font-semibold text-foreground">{copy.sampleBudgetValue}</strong>
            </p>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{copy.disclaimer}</p>
        </div>
      </div>
    </section>
  )
}

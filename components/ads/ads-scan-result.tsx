'use client'

import { useEffect, useRef } from 'react'
import { useLanguage } from '@/components/language-provider'
import { AdsNewScanButton } from '@/components/ads/sections/ads-new-scan-button'
import type { PublicScanResult } from '@/lib/ads/scan-orchestrator'

function formatTry(amount: number, lang: string): string {
  return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(amount)
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item} className="rounded-full border border-border bg-secondary px-3 py-1 text-sm text-foreground">
          {item}
        </li>
      ))}
    </ul>
  )
}

function PlanSummary({ result }: { result: PublicScanResult }) {
  const { t } = useLanguage()
  const copy = t.ads
  const { plan } = result
  const location = [plan.country, ...plan.cities].join(', ')
  const rows: Array<[string, string]> = [
    [copy.summaryBrand, plan.brand],
    [copy.summarySector, plan.sectorLabel],
    [copy.summaryServices, plan.services.join(', ')],
    [copy.summaryLanguage, plan.language === 'tr' ? copy.languageTr : copy.languageEn],
    [copy.summaryLocation, location],
  ]
  return (
    <section aria-labelledby="ads-summary" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <h3 id="ads-summary" className="text-lg font-semibold">
        {copy.summaryTitle}
      </h3>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {plan.languageFallback ? <p className="text-sm text-muted-foreground">{copy.languageFallbackNote}</p> : null}
    </section>
  )
}

function AdPreviewCard({ result }: { result: PublicScanResult }) {
  const { t } = useLanguage()
  const copy = t.ads
  const headline = result.ad.headlines.slice(0, 3).join(' | ')
  const descriptions = result.ad.descriptions.slice(0, 2)
  return (
    <section aria-labelledby="ads-preview" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <h3 id="ads-preview" className="text-lg font-semibold">
        {copy.adPreviewTitle}
      </h3>
      <div className="flex flex-col gap-1 rounded-xl border border-border bg-background p-4">
        <p className="text-sm text-muted-foreground">
          <span className="me-2 rounded border border-border px-1.5 py-0.5 text-xs font-semibold text-foreground">
            {copy.adLabel}
          </span>
          {result.ad.displayUrl}
        </p>
        <p className="text-lg font-medium text-brand">{headline}</p>
        {descriptions.map((line) => (
          <p key={line} className="text-sm leading-relaxed text-foreground">
            {line}
          </p>
        ))}
      </div>
    </section>
  )
}

function KeywordGroups({ result }: { result: PublicScanResult }) {
  const { t } = useLanguage()
  const copy = t.ads
  return (
    <section aria-labelledby="ads-keywords" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <h3 id="ads-keywords" className="text-lg font-semibold">
        {copy.keywordsTitle}
      </h3>
      <Chips items={result.plan.keywords} />
      {result.plan.negativeKeywords.length > 0 ? (
        <>
          <h4 className="mt-2 text-sm font-semibold text-muted-foreground">{copy.negativeKeywordsTitle}</h4>
          <Chips items={result.plan.negativeKeywords} />
        </>
      ) : null}
    </section>
  )
}

function BudgetPanel({ result }: { result: PublicScanResult }) {
  const { t, lang } = useLanguage()
  const copy = t.ads
  const { budget } = result
  const rows: Array<[string, number]> = [
    [copy.budgetDaily, budget.daily],
    [copy.budgetMaxDaily, budget.maxDaily],
    [copy.budgetMaxMonthly, budget.maxMonthly],
  ]
  return (
    <section aria-labelledby="ads-budget" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <h3 id="ads-budget" className="text-lg font-semibold">
        {copy.budgetTitle}
      </h3>
      <dl className="grid gap-4 sm:grid-cols-3">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-xl font-semibold text-foreground">{formatTry(amount, lang)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm leading-relaxed text-muted-foreground">{copy.budgetDisclaimer}</p>
    </section>
  )
}

export function AdsScanResult({ result, onNewScan }: { result: PublicScanResult; onNewScan: () => void }) {
  const { t } = useLanguage()
  const copy = t.ads
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div className="flex w-full flex-col gap-4 text-start">
      <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
        {copy.resultTitle}: {result.host}
      </h2>
      {result.restricted.length > 0 ? (
        <div role="note" className="rounded-2xl border border-border bg-secondary p-4 text-sm">
          <p className="font-semibold text-foreground">{copy.restrictedTitle}</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">{copy.restrictedBody}</p>
        </div>
      ) : null}
      <PlanSummary result={result} />
      <AdPreviewCard result={result} />
      <KeywordGroups result={result} />
      <BudgetPanel result={result} />
      <p className="text-sm text-muted-foreground">{copy.previewNote}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled
          className="inline-flex h-10 cursor-not-allowed items-center rounded-xl bg-secondary px-4 text-sm font-medium text-muted-foreground"
        >
          {copy.publishSoon}
          <span className="ms-2 rounded-full bg-background px-2 py-0.5 text-xs">{copy.comingSoon}</span>
        </button>
        <AdsNewScanButton onClick={onNewScan}>{copy.newScan}</AdsNewScanButton>
      </div>
    </div>
  )
}

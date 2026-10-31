'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { ADS_CREDIT_COSTS, ADS_FREE_LIMITS } from '@/lib/ads/credit-costs'

export function AdsCreditsSection() {
  const { t } = useLanguage()
  const copy = t.ads.sections.credits
  const comingSoonRows = [
    { label: copy.imageTitle, cost: ADS_CREDIT_COSTS.image },
    { label: copy.publishTitle, cost: ADS_CREDIT_COSTS.publish },
    { label: copy.reviseTitle, cost: ADS_CREDIT_COSTS.revise },
    { label: copy.weeklyOptimizationTitle, cost: ADS_CREDIT_COSTS.weeklyOptimization },
    { label: copy.assistantTitle, cost: ADS_CREDIT_COSTS.assistant },
  ]

  return (
    <section aria-labelledby="ads-credits-heading" className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
      <div className="mb-6 flex flex-col gap-2">
        <h2 id="ads-credits-heading" className="text-balance text-2xl font-semibold tracking-tight">
          {copy.title}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{copy.intro}</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">{copy.title}</caption>
          <colgroup>
            <col className="w-3/5" />
            <col className="w-1/6" />
            <col className="w-[23.333%]" />
          </colgroup>
          <thead className="bg-secondary/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-3 font-medium sm:px-4">
                {copy.actionHeader}
              </th>
              <th scope="col" className="px-2 py-3 text-center font-medium sm:px-4">
                {copy.costHeader}
              </th>
              <th scope="col" className="px-2 py-3 text-center font-medium sm:px-4">
                {copy.statusHeader}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <th scope="row" className="px-3 py-4 text-left font-medium sm:px-4">
                <span className="block">{copy.scanTitle}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {copy.signedInQuota}: {ADS_FREE_LIMITS.signedInPerDay} · {copy.guestQuota}:{' '}
                  {ADS_FREE_LIMITS.anonPerCookiePerDay}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {copy.afterFreeQuota}: {ADS_CREDIT_COSTS.scanAndPreview} {copy.creditUnit}
                </span>
              </th>
              <td className="px-2 py-4 text-center font-mono font-semibold sm:px-4">
                {ADS_CREDIT_COSTS.scanAndPreview}
              </td>
              <td className="px-2 py-4 text-center sm:px-4">
                <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {copy.availableNow}
                </span>
              </td>
            </tr>
            {comingSoonRows.map(({ label, cost }) => (
              <tr key={label}>
                <th scope="row" className="px-3 py-4 text-left font-medium sm:px-4">
                  {label}
                </th>
                <td className="px-2 py-4 text-center font-mono font-semibold sm:px-4">{cost}</td>
                <td className="px-2 py-4 text-center sm:px-4">
                  <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {copy.comingSoon}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p>{t.ads.creditsNote}</p>
          <p>{copy.balanceNote}</p>
        </div>
        <Link href="/billing" className="inline-flex w-fit items-center gap-1 font-medium text-brand hover:underline">
          {copy.billingLink}
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </section>
  )
}

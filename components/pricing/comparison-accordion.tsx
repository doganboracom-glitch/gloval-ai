'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { ComparisonCell } from '@/components/pricing/comparison-cell'
import { ComparisonPlanPicker } from '@/components/pricing/comparison-plan-picker'
import { buildComparison, getComparisonCopy } from '@/lib/plan-copy'
import { COMPARISON_PLANS, POPULAR_PLAN } from '@/lib/plan-comparison'
import { getDirection } from '@/lib/locale-registry'
import type { PlanCode } from '@/lib/pricing-config'

/**
 * Paket karşılaştırması — varsayılan olarak KAPALI accordion.
 *
 * Masaüstünde (md ve üzeri) 4 kolonlu tablo, dar ekranlarda ise paket seçmeli
 * sekme görünümü gösterilir; böylece tablo hiçbir ekranda sayfayı yatay
 * genişletmez. `currentPlanCode` verilirse sekme görünümü o paketle açılır.
 */
export function ComparisonAccordion({
  currentPlanCode,
}: {
  currentPlanCode?: PlanCode | null
}) {
  const [open, setOpen] = useState(false)
  const { lang } = useLanguage()
  const copy = getComparisonCopy(lang)
  const comparison = buildComparison(lang)

  return (
    <section className="mt-10 min-w-0">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-card">
        <h3>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="plan-comparison-panel"
            className="flex min-h-14 w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="font-display text-base font-semibold">
              {copy.toggle}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                open ? 'rotate-180' : ''
              }`}
            />
          </button>
        </h3>

        {open && (
          <div id="plan-comparison-panel" className="border-t border-border">
            <ComparisonPlanPicker
              className="md:hidden"
              comparison={comparison}
              copy={copy}
              currentPlanCode={currentPlanCode}
              rtl={getDirection(lang) === 'rtl'}
            />

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="w-[30%] px-4 py-3 text-xs font-medium text-muted-foreground"
                    >
                      {copy.featureColumn}
                    </th>
                    {COMPARISON_PLANS.map((plan) => (
                      <th
                        key={plan.code}
                        scope="col"
                        className={`px-2 py-3 text-center font-display text-[11px] font-bold tracking-widest ${
                          plan.code === POPULAR_PLAN
                            ? 'text-brand'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                {comparison.map((group) => (
                  <tbody key={group.category}>
                    <tr>
                      <th
                        scope="colgroup"
                        colSpan={5}
                        className="border-t border-border bg-secondary/40 px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
                      >
                        {group.category}
                      </th>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={`${group.category}-${row.label}`}>
                        <th
                          scope="row"
                          className="border-t border-border/60 py-3 pl-4 pr-3 text-xs font-normal text-muted-foreground sm:text-sm"
                        >
                          {row.label}
                        </th>
                        {COMPARISON_PLANS.map((plan) => (
                          <td
                            key={plan.code}
                            className={`border-t border-border/60 px-2 py-3 text-center ${
                              plan.code === POPULAR_PLAN ? 'bg-brand/5 font-medium' : ''
                            }`}
                          >
                            <ComparisonCell value={row[plan.code]} copy={copy} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

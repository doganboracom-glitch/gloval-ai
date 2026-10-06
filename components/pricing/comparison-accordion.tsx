'use client'

import { useState } from 'react'
import { Check, ChevronDown, Minus } from 'lucide-react'
import { COMPARISON, type ComparisonValue } from '@/lib/pricing-config'

const PLAN_COLUMNS = ['FREE', 'STARTER', 'PRO', 'E-TİCARET'] as const

function Cell({ value }: { value: ComparisonValue }) {
  if (value === true) {
    return (
      <>
        <Check className="mx-auto h-4 w-4 text-brand" aria-hidden />
        <span className="sr-only">Var</span>
      </>
    )
  }
  if (value === false) {
    return (
      <>
        <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-hidden />
        <span className="sr-only">Yok</span>
      </>
    )
  }
  return <span className="text-xs sm:text-sm">{value}</span>
}

/**
 * Paket karşılaştırması — varsayılan olarak KAPALI accordion.
 *
 * Eskiden sayfanın altında her zaman açık duran büyük tablo vardı; sayfa
 * akışını boğduğu için detay isteyene açılan tek bir bloğa indirildi ve
 * paket kartlarının hemen altına taşındı.
 */
export function ComparisonAccordion() {
  const [open, setOpen] = useState(false)

  return (
    <section className="mt-10">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-card">
        <h3>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="plan-comparison-panel"
            className="flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="font-display text-base font-semibold">
              Paket özelliklerini karşılaştır
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
            {/* Mobilde yatay kaydırma: 4 paket sığmadığında tablo daraltılıp
                okunamaz hale gelmesin. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="w-[30%] px-4 py-3 text-xs font-medium text-muted-foreground"
                    >
                      Özellik
                    </th>
                    {PLAN_COLUMNS.map((name) => (
                      <th
                        key={name}
                        scope="col"
                        className={`px-2 py-3 text-center font-display text-[11px] font-bold tracking-widest ${
                          name === 'PRO' ? 'text-brand' : 'text-muted-foreground'
                        }`}
                      >
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                {COMPARISON.map((group) => (
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
                        <td className="border-t border-border/60 px-2 py-3 text-center">
                          <Cell value={row.free} />
                        </td>
                        <td className="border-t border-border/60 px-2 py-3 text-center">
                          <Cell value={row.starter} />
                        </td>
                        <td className="border-t border-border/60 bg-brand/5 px-2 py-3 text-center font-medium">
                          <Cell value={row.pro} />
                        </td>
                        <td className="border-t border-border/60 px-2 py-3 text-center">
                          <Cell value={row.ecommerce} />
                        </td>
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

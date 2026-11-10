'use client'

import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { HEARD_FROM_VALUES } from '@/lib/heard-from'
import { Panel } from '@/components/admin/admin-ui'
import type { HeardFromSummary } from '@/lib/admin/heard-from-summary'

export function HeardFromSummaryCard({ summary }: { summary: HeardFromSummary }) {
  const { lang } = useLanguage()
  const t = adminT(lang).dashboard.heardFrom
  const numberFmt = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 1 })
  const pctFmt = (n: number) => (lang === 'tr' ? `%${numberFmt.format(n)}` : `${numberFmt.format(n)}%`)

  const rows = [
    ...HEARD_FROM_VALUES.map((value) => ({
      key: value as string,
      label: t[value],
      count: summary.counts[value],
      muted: false,
    })),
    { key: 'unanswered', label: t.unanswered, count: summary.unanswered, muted: true },
  ]

  return (
    <Panel title={`${t.title} · ${t.windowLabel.replace('{days}', String(summary.windowDays))}`}>
      <div className="flex flex-col gap-4 p-4">
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">{t.totalSignups}</dt>
            <dd className="font-display text-xl font-semibold tabular-nums">{numberFmt.format(summary.totalSignups)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t.answered}</dt>
            <dd className="font-display text-xl font-semibold tabular-nums">{numberFmt.format(summary.answered)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t.responseRate}</dt>
            <dd className="font-display text-xl font-semibold tabular-nums">{pctFmt(summary.responseRatePct)}</dd>
          </div>
        </dl>

        {summary.answered === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t.empty}
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {rows.map((row) => {
              const width = summary.totalSignups > 0 ? (row.count / summary.totalSignups) * 100 : 0
              return (
                <li key={row.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className={row.muted ? 'text-muted-foreground' : undefined}>{row.label}</span>
                    <span className="tabular-nums">{numberFmt.format(row.count)}</span>
                  </div>
                  <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={row.muted ? 'h-full rounded-full bg-muted-foreground/40' : 'h-full rounded-full bg-brand'}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Panel>
  )
}

'use client'

import { useLanguage } from '@/components/language-provider'
import { StatusBadge, STATUS_TONE } from '@/components/mail/status-badge'
import { formatMb } from '@/lib/mail/access'
import type { AdminMailStats } from '@/lib/mail'
import type { MailLogEntry } from '@/lib/mail/types'

export function MailOverview({
  stats,
  recent,
}: {
  stats: AdminMailStats
  recent: MailLogEntry[]
}) {
  const { t, lang } = useLanguage()
  const m = t.mail

  const timeFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  const logLabel = (status: MailLogEntry['status']) =>
    ({
      delivered: m.stDelivered,
      bounced: m.stBounced,
      deferred: m.stDeferred,
      rejected: m.stRejected,
    })[status]

  const cards: Array<{ label: string; value: string }> = [
    { label: m.statDomains, value: String(stats.domains) },
    { label: m.statActiveDomains, value: String(stats.activeDomains) },
    { label: m.statMailboxes, value: String(stats.mailboxes) },
    { label: m.statAliases, value: String(stats.aliases) },
    { label: m.statStorage, value: formatMb(stats.storageUsedMb) },
    { label: m.statDelivered, value: String(stats.delivered24h) },
    { label: m.statFailed, value: String(stats.failed24h) },
  ]

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="sr-only">{m.adminOverview}</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-card/70 p-4">
              <dt className="text-xs text-muted-foreground">{card.label}</dt>
              <dd className="mt-1.5 font-display text-2xl font-bold">{card.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">{m.recentActivity}</h2>
        {recent.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
            {m.noResults}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {recent.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{entry.subject}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {entry.from} {'->'} {entry.to}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {timeFmt.format(new Date(entry.at))}
                  </span>
                  <StatusBadge tone={STATUS_TONE[entry.status]}>
                    {logLabel(entry.status)}
                  </StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

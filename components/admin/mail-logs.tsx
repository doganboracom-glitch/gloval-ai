'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { StatusBadge, STATUS_TONE } from '@/components/mail/status-badge'
import type { MailLogEntry, MailLogStatus } from '@/lib/mail/types'

const STATUSES: MailLogStatus[] = ['delivered', 'bounced', 'deferred', 'rejected']

export function MailLogs({ logs }: { logs: MailLogEntry[] }) {
  const { t, lang } = useLanguage()
  const m = t.mail

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<MailLogStatus | ''>('')

  const timeFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  const label = (s: MailLogStatus) =>
    ({
      delivered: m.stDelivered,
      bounced: m.stBounced,
      deferred: m.stDeferred,
      rejected: m.stRejected,
    })[s]

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return logs.filter((entry) => {
      if (status && entry.status !== status) return false
      if (!needle) return true
      return `${entry.from} ${entry.to} ${entry.subject}`.toLowerCase().includes(needle)
    })
  }, [logs, query, status])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-56 flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
          <span className="sr-only">{m.search}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m.searchPlaceholder}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="sr-only">{m.statusLabel}</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as MailLogStatus | '')}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{m.allStatuses}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-14 text-center text-sm text-muted-foreground">
          {m.noResults}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card/70">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">
                  {m.time}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {m.from}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {m.to}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {m.subject}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {m.statusLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id} className="border-t border-border/60 align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {timeFmt.format(new Date(entry.at))}
                  </td>
                  <td className="px-4 py-3 text-xs">{entry.from}</td>
                  <td className="px-4 py-3 text-xs">{entry.to}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{entry.subject}</p>
                    {entry.detail && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={STATUS_TONE[entry.status]}>{label(entry.status)}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

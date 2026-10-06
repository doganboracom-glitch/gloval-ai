'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { StatusBadge } from '@/components/mail/status-badge'
import { formatMb, usagePercent } from '@/lib/mail/access'
import type { Mailbox } from '@/lib/mail/types'

type Row = Mailbox & { domain: string }

export function MailMailboxes({ mailboxes }: { mailboxes: Row[] }) {
  const { t } = useLanguage()
  const m = t.mail

  const [query, setQuery] = useState('')
  const [domainFilter, setDomainFilter] = useState('')

  const domainOptions = useMemo(
    () => [...new Set(mailboxes.map((box) => box.domain))].sort(),
    [mailboxes],
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return mailboxes.filter((box) => {
      if (domainFilter && box.domain !== domainFilter) return false
      if (!needle) return true
      return `${box.address} ${box.displayName}`.toLowerCase().includes(needle)
    })
  }, [mailboxes, query, domainFilter])

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
          <span className="sr-only">{m.domain}</span>
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{m.domain}</option>
            {domainOptions.map((d) => (
              <option key={d} value={d}>
                {d}
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
                  {m.address}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {m.displayName}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {m.usage}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {m.statusLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((box) => (
                <tr key={box.id} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">{box.address}</td>
                  <td className="px-4 py-3 text-muted-foreground">{box.displayName}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${usagePercent(box.usedMb, box.quotaMb)}%` }}
                        />
                      </div>
                      <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {formatMb(box.usedMb)} / {formatMb(box.quotaMb)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={box.status === 'active' ? 'success' : 'muted'}>
                      {box.status === 'active' ? m.stActive : m.stSuspended}
                    </StatusBadge>
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

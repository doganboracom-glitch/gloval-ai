'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useLanguage } from '@/components/language-provider'
import { DataTable, PageHeader, Panel, StatusBadge, Td, Th, Tr } from '@/components/admin/admin-ui'
import { Input } from '@/components/ui/input'
import { getMakerRequestCopy } from '@/lib/maker-requests/copy'
import type { MakerRequest, MakerRequestStatus } from '@/lib/maker-requests/types'

function statusTone(status: MakerRequestStatus) {
  if (status === 'new') return 'warning'
  if (status === 'answered') return 'success'
  return 'muted'
}

function formatDate(value: string, locale: string, fallback: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function AdminMakerRequestsView({
  items,
  schemaReady,
}: {
  items: MakerRequest[]
  schemaReady: boolean
}) {
  const { lang } = useLanguage()
  const copy = getMakerRequestCopy(lang).admin
  const formCopy = getMakerRequestCopy(lang).form
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | MakerRequestStatus>('all')
  const normalizedQuery = query.trim().toLocaleLowerCase(locale)

  const filteredItems = useMemo(() => items.filter((item) => {
    if (status !== 'all' && item.status !== status) return false
    if (!normalizedQuery) return true
    return [item.full_name, item.email, item.phone, item.id]
      .some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery))
  }), [items, locale, normalizedQuery, status])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

      {!schemaReady ? (
        <p role="status" className="rounded-xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
          {copy.schemaMissing}
        </p>
      ) : null}

      <Panel>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.search}
            className="sm:max-w-sm"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{copy.filterStatus}</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.currentTarget.value as 'all' | MakerRequestStatus)}
              aria-label={copy.filterStatus}
              className="h-10 rounded-lg border border-input bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <option value="all">{copy.statuses.all}</option>
              <option value="new">{copy.statuses.new}</option>
              <option value="answered">{copy.statuses.answered}</option>
              <option value="closed">{copy.statuses.closed}</option>
            </select>
          </label>
        </div>

        <div className="p-4 pt-0 sm:hidden">
          {filteredItems.length ? (
            <ul className="flex flex-col gap-3">
              {filteredItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/admin/maker-requests/${item.id}`}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{item.full_name}</p>
                        <p className="mt-1 break-all text-sm text-muted-foreground">{item.email}</p>
                      </div>
                      <StatusBadge
                    tone={statusTone(item.status)}
                    className={item.status === 'new' ? 'bg-brand/15 text-brand' : undefined}
                  >
                    {copy.statuses[item.status]}
                  </StatusBadge>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span>{formCopy.budgets[item.budget_range]}</span>
                      <time dateTime={item.created_at}>{formatDate(item.created_at, locale, copy.unknown)}</time>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
              {copy.noResults}
            </p>
          )}
        </div>

        <div className="hidden px-4 pb-4 sm:block">
          <DataTable
            head={(
              <>
                <Th>{copy.name}</Th>
                <Th>{copy.phone}</Th>
                <Th>{copy.budget}</Th>
                <Th>{copy.status}</Th>
                <Th>{copy.created}</Th>
                <Th className="text-right">{copy.openDetails}</Th>
              </>
            )}
            empty={copy.noResults}
            isEmpty={filteredItems.length === 0}
          >
            {filteredItems.map((item) => (
              <Tr key={item.id}>
                <Td>
                  <Link href={`/admin/maker-requests/${item.id}`} className="font-medium text-brand underline-offset-4 hover:underline">
                    {item.full_name}
                  </Link>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{item.email}</p>
                </Td>
                <Td>{item.phone}</Td>
                <Td>{formCopy.budgets[item.budget_range]}</Td>
                <Td><StatusBadge
                    tone={statusTone(item.status)}
                    className={item.status === 'new' ? 'bg-brand/15 text-brand' : undefined}
                  >
                    {copy.statuses[item.status]}
                  </StatusBadge></Td>
                <Td><time dateTime={item.created_at}>{formatDate(item.created_at, locale, copy.unknown)}</time></Td>
                <Td className="text-right">
                  <Link href={`/admin/maker-requests/${item.id}`} className="text-sm font-medium text-brand underline-offset-4 hover:underline">
                    {copy.openDetails}
                  </Link>
                </Td>
              </Tr>
            ))}
          </DataTable>
        </div>
      </Panel>
    </div>
  )
}

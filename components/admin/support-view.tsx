'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { PageHeader, DataTable, Th, Td, Tr, StatusBadge, type MailStatusTone } from '@/components/admin/admin-ui'
import { TicketStatusPill } from '@/components/support/ticket-status-pill'
import type { AdminTicket } from '@/lib/admin/queries'

type Filter = 'all' | 'open' | 'in_progress' | 'waiting_user' | 'answered' | 'resolved'

const PRIORITY_TONE: Record<string, MailStatusTone> = {
  high: 'danger',
  normal: 'muted',
  low: 'muted',
}

export function SupportView({ tickets }: { tickets: AdminTicket[] }) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const [filter, setFilter] = useState<Filter>('all')

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  const filtered = useMemo(
    () => (filter === 'all' ? tickets : tickets.filter((t) => t.status === filter)),
    [tickets, filter],
  )

  const filters: Filter[] = ['all', 'open', 'in_progress', 'waiting_user', 'answered', 'resolved']
  const priorityLabel = (p: string) =>
    p === 'high' ? t.support.high : p === 'low' ? t.support.low : t.support.normal

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.support.title} subtitle={t.support.subtitle} />

      <div className="flex gap-1 rounded-lg border border-border bg-card/70 p-1 self-start">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              'rounded-md px-3 py-1 text-xs font-medium transition-colors ' +
              (filter === f ? 'bg-brand/15 text-brand' : 'text-muted-foreground hover:text-foreground')
            }
          >
            {f === 'all' ? t.common.all : (t.status as Record<string, string>)[f]}
          </button>
        ))}
      </div>

      <DataTable
        isEmpty={filtered.length === 0}
        empty={t.support.empty}
        head={
          <>
            <Th>{t.support.subject}</Th>
            <Th>{t.common.owner}</Th>
            <Th>{t.support.priority}</Th>
            <Th className="text-right">{t.support.messages}</Th>
            <Th>{t.common.updated}</Th>
            <Th>{t.common.status}</Th>
          </>
        }
      >
        {filtered.map((ticket) => (
          <Tr key={ticket.id}>
            <Td className="font-medium">
              <Link href={`/admin/support/${ticket.id}`} className="hover:text-brand">
                {ticket.subject}
              </Link>
              <span className="block font-mono text-xs text-muted-foreground">{ticket.ticketNumber}</span>
            </Td>
            <Td className="text-muted-foreground">{ticket.userEmail ?? t.common.none}</Td>
            <Td>
              <StatusBadge tone={PRIORITY_TONE[ticket.priority] ?? 'muted'}>
                {priorityLabel(ticket.priority)}
              </StatusBadge>
            </Td>
            <Td className="text-right tabular-nums">{ticket.messageCount}</Td>
            <Td className="whitespace-nowrap text-muted-foreground">
              {dateFmt.format(new Date(ticket.updatedAt))}
            </Td>
            <Td>
<TicketStatusPill
              status={ticket.status}
              label={(t.status as Record<string, string>)[ticket.status]}
            />
            </Td>
          </Tr>
        ))}
      </DataTable>
    </div>
  )
}

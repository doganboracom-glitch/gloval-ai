'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import type { AdminNotification } from '@/lib/admin/queries'
import {
  PageHeader,
  StatCard,
  DataTable,
  Th,
  Td,
  Tr,
  StatusBadge,
  type MailStatusTone,
} from '@/components/admin/admin-ui'

const STATUS_TONE: Record<string, MailStatusTone> = {
  sent: 'success',
  queued: 'warning',
  failed: 'danger',
}

export function NotificationsView({ notifications }: { notifications: AdminNotification[] }) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState<'all' | 'email' | 'system'>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return notifications.filter((n) => {
      if (channel !== 'all' && n.channel !== channel) return false
      if (!q) return true
      return (
        n.type.toLowerCase().includes(q) ||
        (n.subject ?? '').toLowerCase().includes(q) ||
        (n.userEmail ?? '').toLowerCase().includes(q)
      )
    })
  }, [notifications, query, channel])

  const sent = notifications.filter((n) => n.status === 'sent').length
  const failed = notifications.filter((n) => n.status === 'failed').length

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.notifications.title} subtitle={t.notifications.subtitle} />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t.notifications.total} value={notifications.length} />
        <StatCard label={t.notifications.sent} value={sent} />
        <StatCard label={t.notifications.failed} value={failed} />
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.common.search}
          className="h-9 w-full max-w-xs rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40"
        />
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as typeof channel)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40"
        >
          <option value="all">{t.notifications.allChannels}</option>
          <option value="email">{t.notifications.email}</option>
          <option value="system">{t.notifications.system}</option>
        </select>
      </div>

      <DataTable
        isEmpty={filtered.length === 0}
        empty={t.common.empty}
        head={
          <>
            <Th>{t.notifications.type}</Th>
            <Th>{t.notifications.recipient}</Th>
            <Th>{t.notifications.channel}</Th>
            <Th>{t.common.status}</Th>
            <Th>{t.common.created}</Th>
          </>
        }
      >
        {filtered.map((n) => (
          <Tr key={n.id}>
            <Td>
              <div className="font-medium text-foreground">{n.subject || n.type}</div>
              <div className="text-xs text-muted-foreground">{n.type}</div>
            </Td>
            <Td>
              {n.userId ? (
                <Link href={`/admin/users/${n.userId}`} className="text-brand hover:underline">
                  {n.userEmail ?? n.userId}
                </Link>
              ) : (
                <span className="text-muted-foreground">{t.notifications.broadcast}</span>
              )}
            </Td>
            <Td className="text-muted-foreground">
              {n.channel === 'email' ? t.notifications.email : t.notifications.system}
            </Td>
            <Td>
              <StatusBadge tone={STATUS_TONE[n.status] ?? 'muted'} label={t.status[n.status as keyof typeof t.status] ?? n.status} />
            </Td>
            <Td className="text-muted-foreground">{fmt(n.createdAt)}</Td>
          </Tr>
        ))}
      </DataTable>
    </div>
  )
}

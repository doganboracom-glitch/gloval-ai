'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { PageHeader, DataTable, Th, Td, Tr, StatusBadge, type MailStatusTone } from '@/components/admin/admin-ui'
import { DetachUnboundDomains } from '@/components/admin/detach-unbound-domains'
import type { CustomDomain } from '@/lib/custom-domains/types'

type AdminDomain = CustomDomain & { ownerEmail: string | null }

const STATUS_TONE: Record<string, MailStatusTone> = {
  active: 'success',
  verifying: 'warning',
  pending: 'warning',
  failed: 'danger',
  disabled: 'muted',
}

export function DomainsView({ domains }: { domains: AdminDomain[] }) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const [query, setQuery] = useState('')

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return domains
    return domains.filter(
      (d) => d.domain.toLowerCase().includes(q) || (d.ownerEmail ?? '').toLowerCase().includes(q),
    )
  }, [domains, query])

  function statusLabel(status: string) {
    return (t.status as Record<string, string>)[status] ?? status
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.domains.title} subtitle={t.domains.subtitle} />

      <DetachUnboundDomains />

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.common.search}
        aria-label={t.common.search}
        className="h-9 w-full max-w-xs rounded-lg border border-border bg-card/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      />

      <DataTable
        isEmpty={filtered.length === 0}
        empty={t.common.empty}
        head={
          <>
            <Th>{t.domains.domain}</Th>
            <Th>{t.common.owner}</Th>
            <Th>{t.common.status}</Th>
            <Th>{t.common.created}</Th>
          </>
        }
      >
        {filtered.map((d) => (
          <Tr key={d.id}>
            <Td className="font-medium">
              {d.domain}
              {d.isPrimary ? (
                <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">
                  {t.domains.primary}
                </span>
              ) : null}
              {d.mock ? (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t.domains.mock}
                </span>
              ) : null}
            </Td>
            <Td className="text-muted-foreground">
              {d.ownerEmail ? (
                <Link href={`/admin/users/${d.userId}`} className="hover:text-brand">
                  {d.ownerEmail}
                </Link>
              ) : (
                t.common.none
              )}
            </Td>
            <Td>
              <StatusBadge tone={STATUS_TONE[d.status] ?? 'muted'}>{statusLabel(d.status)}</StatusBadge>
            </Td>
            <Td className="whitespace-nowrap text-muted-foreground">
              {dateFmt.format(new Date(d.createdAt))}
            </Td>
          </Tr>
        ))}
      </DataTable>
    </div>
  )
}

'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { toBilingual } from '@/lib/i18n'
import { adminT } from '@/lib/admin/i18n'
import { cancelUserSubscription } from '@/lib/admin/actions'
import { formatMoney, intervalSuffix } from '@/lib/billing-utils'
import type { BillingInterval } from '@/lib/billing'
import { Button } from '@/components/ui/button'
import { PageHeader, DataTable, Th, Td, Tr, StatusBadge, type MailStatusTone } from '@/components/admin/admin-ui'
import type { AdminSubscription } from '@/lib/admin/queries'

const STATUS_TONE: Record<string, MailStatusTone> = {
  active: 'success',
  trialing: 'success',
  past_due: 'warning',
  suspended: 'danger',
  incomplete: 'warning',
  canceled: 'muted',
}

export function BillingView({ subscriptions }: { subscriptions: AdminSubscription[] }) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return subscriptions
    return subscriptions.filter(
      (s) =>
        (s.userEmail ?? '').toLowerCase().includes(q) ||
        s.planName.toLowerCase().includes(q),
    )
  }, [subscriptions, query])

  function statusLabel(status: string) {
    return (t.status as Record<string, string>)[status] ?? status
  }

  function cancel(s: AdminSubscription) {
    setPendingId(s.id)
    startTransition(async () => {
      await cancelUserSubscription(s.id)
      setPendingId(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.billing.title} subtitle={t.billing.subtitle} />

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
            <Th>{t.common.owner}</Th>
            <Th>{t.billing.plan}</Th>
            <Th className="text-right">{t.billing.price}</Th>
            <Th>{t.common.status}</Th>
            <Th>{t.billing.renews}</Th>
            <Th className="text-right">{t.common.actions}</Th>
          </>
        }
      >
        {filtered.map((s) => {
          const canCancel =
            (s.status === 'active' || s.status === 'trialing') && !s.cancelAtPeriodEnd && s.priceCents > 0
          return (
            <Tr key={s.id}>
              <Td>
                {s.userEmail ? (
                  <Link href={`/admin/users/${s.userId}`} className="font-medium hover:text-brand">
                    {s.userEmail}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{t.common.none}</span>
                )}
              </Td>
              <Td className="text-muted-foreground">{s.planName}</Td>
              <Td className="text-right whitespace-nowrap tabular-nums">
                {s.priceCents > 0
                  ? `${formatMoney(s.priceCents, s.currency)}${intervalSuffix(s.interval as BillingInterval, toBilingual(lang))}`
                  : t.users.noPlan}
              </Td>
              <Td>
                <StatusBadge tone={STATUS_TONE[s.status] ?? 'muted'}>{statusLabel(s.status)}</StatusBadge>
              </Td>
              <Td className="whitespace-nowrap text-muted-foreground">
                {s.cancelAtPeriodEnd ? (
                  <span className="text-destructive">{t.billing.cancelAtEnd}</span>
                ) : s.currentPeriodEnd ? (
                  dateFmt.format(new Date(s.currentPeriodEnd))
                ) : (
                  t.common.none
                )}
              </Td>
              <Td className="text-right">
                {canCancel ? (
                  <Button size="sm" variant="outline" disabled={pendingId === s.id} onClick={() => cancel(s)}>
                    {pendingId === s.id ? t.common.loading : t.billing.cancel}
                  </Button>
                ) : s.cancelAtPeriodEnd ? (
                  <span className="text-xs text-muted-foreground">{t.billing.canceled}</span>
                ) : (
                  <span className="text-muted-foreground">{t.common.none}</span>
                )}
              </Td>
            </Tr>
          )
        })}
      </DataTable>
    </div>
  )
}

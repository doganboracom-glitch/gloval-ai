'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { MessageCircle, Phone } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { PageHeader, DataTable, Th, Td, Tr, StatusBadge, type MailStatusTone } from '@/components/admin/admin-ui'
import { OverdueActionDialog, type OverdueDialogMode } from '@/components/admin/overdue-dialogs'
import { formatMoney } from '@/lib/billing-utils'
import { fillCopy, overdueT } from '@/lib/admin/overdue-copy'
import { whatsappNumber } from '@/lib/admin/overdue-logic'
import type { OverdueList, OverdueRow } from '@/lib/admin/overdue-queries'

const REASON_TONE: Record<string, MailStatusTone> = {
  past_due: 'warning',
  payment_failed_suspended: 'danger',
  period_expired: 'muted',
}
const SERVICE_TONE: Record<string, MailStatusTone> = {
  active: 'success',
  grace: 'warning',
  suspended: 'danger',
  none: 'muted',
}

export type OverdueQuery = { reason: string; plan: string; noContact: boolean; q: string }

export function OverdueView({ list, query }: { list: OverdueList; query: OverdueQuery }) {
  const { lang } = useLanguage()
  const t = overdueT(lang)
  const router = useRouter()
  const pathname = usePathname()
  const [dialog, setDialog] = useState<{ mode: OverdueDialogMode; row: OverdueRow } | null>(null)
  const [search, setSearch] = useState(query.q)

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' })

  function navigate(next: Partial<OverdueQuery> & { page?: number }) {
    const merged = { ...query, ...next }
    const params = new URLSearchParams()
    if (merged.reason && merged.reason !== 'all') params.set('reason', merged.reason)
    if (merged.plan) params.set('plan', merged.plan)
    if (merged.noContact) params.set('noContact', '1')
    if (merged.q) params.set('q', merged.q)
    if (next.page && next.page > 1) params.set('page', String(next.page))
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  const selectClass = 'h-9 rounded-md border border-border bg-background px-2 text-sm'

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          navigate({ q: search.trim() })
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          className="h-9 w-56 rounded-md border border-border bg-background px-3 text-sm"
        />
        <select aria-label={t.filterAllReasons} className={selectClass} value={query.reason} onChange={(e) => navigate({ reason: e.target.value })}>
          <option value="all">{t.filterAllReasons}</option>
          {Object.entries(t.reason).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select aria-label={t.filterAllPlans} className={selectClass} value={query.plan} onChange={(e) => navigate({ plan: e.target.value })}>
          <option value="">{t.filterAllPlans}</option>
          {list.planOptions.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={query.noContact} onChange={(e) => navigate({ noContact: e.target.checked })} />
          {t.filterNoContact}
        </label>
      </form>

      <DataTable
        isEmpty={list.rows.length === 0}
        empty={t.empty}
        head={
          <>
            <Th>{t.colUser}</Th>
            <Th>{t.colPlan}</Th>
            <Th>{t.colStatus}</Th>
            <Th>{t.colOverdue}</Th>
            <Th>{t.colServices}</Th>
            <Th>{t.colActions}</Th>
          </>
        }
      >
        {list.rows.map((row) => {
          const wa = whatsappNumber(row.phone)
          const lastNote = row.notes[0]
          return (
            <Tr key={row.subscriptionId}>
              <Td>
                <div className="font-medium">{row.fullName ?? row.email ?? row.userId.slice(0, 8)}</div>
                {row.fullName && row.email ? <div className="text-xs text-muted-foreground">{row.email}</div> : null}
                <div className="mt-1 flex items-center gap-2 text-xs">
                  {row.phone ? (
                    <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                      <Phone className="size-3" aria-hidden />
                      {t.call}
                    </a>
                  ) : null}
                  {wa ? (
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                      <MessageCircle className="size-3" aria-hidden />
                      {t.whatsapp}
                    </a>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {lastNote ? `${t.lastContact}: ${dateFmt.format(new Date(lastNote.createdAt))}` : t.never}
                </div>
              </Td>
              <Td>
                <div>{row.planName}</div>
                <div className="text-xs text-muted-foreground">{formatMoney(row.priceCents, row.currency)}</div>
                {row.providerManaged ? <div className="text-xs text-muted-foreground">{t.providerManaged}: {row.provider}</div> : null}
              </Td>
              <Td>
                <StatusBadge tone={REASON_TONE[row.reason]} label={t.reason[row.reason]} />
                {row.graceEndsAt ? (
                  <div className="mt-1 text-xs text-muted-foreground">{t.colGrace}: {dateFmt.format(new Date(row.graceEndsAt))}</div>
                ) : null}
              </Td>
              <Td className="whitespace-nowrap">
                <div>{row.daysOverdue > 0 ? fillCopy(t.days, { n: row.daysOverdue }) : t.today}</div>
                <div className="text-xs text-muted-foreground">
                  {row.currentPeriodEnd ? dateFmt.format(new Date(row.currentPeriodEnd)) : t.noDate}
                </div>
              </Td>
              <Td>
                <div className="flex flex-col gap-1">
                  <StatusBadge tone={SERVICE_TONE[row.siteState]} label={`${t.sites}: ${t.siteState[row.siteState]}${row.siteCount ? ` (${row.siteCount})` : ''}`} />
                  <StatusBadge tone={SERVICE_TONE[row.mailStatus ?? 'none']} label={`${t.mail}: ${t.mailState[row.mailStatus ?? 'none']}`} />
                </div>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setDialog({ mode: 'note', row })}>{t.note}</Button>
                  <Button size="sm" onClick={() => setDialog({ mode: 'paid', row })}>{t.markPaid}</Button>
                  <Button size="sm" variant="outline" onClick={() => setDialog({ mode: 'gift', row })}>{t.gift}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'history', row })}>{t.history}</Button>
                </div>
              </Td>
            </Tr>
          )
        })}
      </DataTable>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{fillCopy(t.pageOf, { page: list.page, count: list.pageCount, total: list.total })}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={list.page <= 1} onClick={() => navigate({ page: list.page - 1 })}>{t.prev}</Button>
          <Button size="sm" variant="outline" disabled={list.page >= list.pageCount} onClick={() => navigate({ page: list.page + 1 })}>{t.next}</Button>
        </div>
      </div>

      {dialog ? (
        <OverdueActionDialog
          key={`${dialog.mode}:${dialog.row.subscriptionId}`}
          mode={dialog.mode}
          row={dialog.row}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

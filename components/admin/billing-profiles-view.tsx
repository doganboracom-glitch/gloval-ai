'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { getBillingProfileCopy } from '@/lib/billing-profile-copy'
import { exportBillingProfilesCsvAction } from '@/lib/billing-profile-actions'
import type { AdminBillingProfileRow } from '@/lib/admin/billing-profile-data'
import type { BillingProfileExportFilter } from '@/lib/billing-profile-types'

export function BillingProfilesView({
  available,
  rows,
}: {
  available: boolean
  rows: AdminBillingProfileRow[]
}) {
  const { lang } = useLanguage()
  const copy = getBillingProfileCopy(lang)
  const [filter, setFilter] = useState<BillingProfileExportFilter>('all')
  const [search, setSearch] = useState('')
  const [openUserId, setOpenUserId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-US')
    return rows.filter((row) => {
      if (filter === 'incomplete' && row.complete) return false
      if (filter === 'complete' && !row.complete) return false
      if (!query) return true
      return [row.accountEmail, row.fullName, row.profile?.companyTitle ?? '']
        .join(' ')
        .toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-US')
        .includes(query)
    })
  }, [filter, lang, rows, search])

  function exportCsv() {
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await exportBillingProfilesCsvAction(filter, lang === 'tr' ? 'tr' : 'en')
        if (!result.ok) {
          setFeedback({
            type: 'error',
            text: result.error === 'audit_failed' ? copy.exportAuditFailed : copy.exportFailed,
          })
          return
        }
        const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }))
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = result.filename
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        setFeedback({ type: 'success', text: copy.exportDone })
      } catch {
        setFeedback({ type: 'error', text: copy.exportFailed })
      }
    })
  }

  const pageHeading = (
    <header className="flex flex-col gap-2">
      <h2 className="font-display text-2xl font-semibold text-foreground">{copy.adminTitle}</h2>
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{copy.adminSubtitle}</p>
    </header>
  )

  if (!available) {
    return (
      <div className="flex flex-col gap-5">
        {pageHeading}
        <section role="status" className="rounded-2xl border border-border bg-card/70 p-6 text-sm leading-relaxed text-muted-foreground">
          {copy.adminUnavailable}
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {pageHeading}
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card/70 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">{copy.adminSearch}</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">{copy.statusColumn}</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as BillingProfileExportFilter)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">{copy.filterAll}</option>
              <option value="incomplete">{copy.filterIncomplete}</option>
              <option value="complete">{copy.filterComplete}</option>
            </select>
          </label>
        </div>
        <Button type="button" variant="outline" disabled={isPending} onClick={exportCsv} className="shrink-0">
          {isPending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
          {isPending
            ? copy.exporting
            : filter === 'incomplete'
              ? copy.exportIncomplete
              : filter === 'complete'
                ? copy.exportComplete
                : copy.exportAll}
        </Button>
      </section>

      {feedback ? (
        <p role={feedback.type === 'error' ? 'alert' : 'status'} className={feedback.type === 'error' ? 'text-sm text-destructive' : 'text-sm text-accent'}>
          {feedback.text}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card/70">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{copy.emailColumn}</th>
              <th className="px-4 py-3 font-medium">{copy.customerColumn}</th>
              <th className="px-4 py-3 font-medium">{copy.taxOfficeColumn}</th>
              <th className="px-4 py-3 font-medium">{copy.identifierColumn}</th>
              <th className="px-4 py-3 font-medium">{copy.statusColumn}</th>
              <th className="px-4 py-3 font-medium">{copy.actionColumn}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleRows.map((row) => {
              const profile = row.profile
              const customerType = profile?.customerType
              const maskedId =
                customerType === 'individual' && profile?.nationalIdLast3
                  ? `${'•'.repeat(8)}${profile.nationalIdLast3}`
                  : customerType === 'company' && profile?.taxNumberLast3
                    ? `${'•'.repeat(7)}${profile.taxNumberLast3}`
                    : '—'
              const isOpen = openUserId === row.userId
              return (
                <Fragment key={row.userId}>
                  <tr>
                    <td className="max-w-64 px-4 py-3">
                      <span className="block truncate font-medium text-foreground">{row.accountEmail || row.userId}</span>
                      <span className="block truncate text-xs text-muted-foreground">{row.planName}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {customerType === 'company' ? copy.company : customerType === 'individual' ? copy.individual : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{profile?.taxOffice || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{maskedId}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${row.complete ? 'border-accent/25 bg-accent/10 text-accent' : 'border-primary/30 bg-primary/10 text-primary'}`}>
                        {row.complete ? copy.complete : copy.incomplete}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-expanded={isOpen}
                        onClick={() => setOpenUserId(isOpen ? null : row.userId)}
                      >
                        {isOpen ? copy.hideDetails : copy.details}
                      </Button>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr key={`${row.userId}-details`}>
                      <td colSpan={6} className="bg-muted/20 px-4 py-4">
                        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                          <Detail label={copy.user} value={row.fullName || row.accountEmail || row.userId} />
                          <Detail label={copy.plan} value={row.planName} />
                          <Detail label={copy.subscriptionStatus} value={row.subscriptionStatus} />
                          {profile ? (
                            <>
                              <Detail label={copy.companyColumn} value={profile.companyTitle || '—'} />
                              <Detail label={copy.fullNameColumn} value={profile.fullName || '—'} />
                              <Detail label={copy.taxOfficeColumn} value={profile.taxOffice || '—'} />
                              <Detail label={profile.customerType === 'company' ? copy.vknLabel : copy.tcknLabel} value={maskedId} />
                              <Detail label={copy.invoiceEmailColumn} value={profile.invoiceEmail} />
                              <Detail label={copy.phoneColumn} value={profile.phone} />
                              <Detail label={copy.address} value={[profile.addressLine, profile.district, profile.city, profile.postalCode, profile.country].filter(Boolean).join(', ')} />
                              <Detail label={copy.updatedAt} value={new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US').format(new Date(profile.updatedAt))} />
                            </>
                          ) : (
                            <Detail label={copy.profileDetails} value={copy.missingProfile} />
                          )}
                        </dl>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {copy.noRows}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {visibleRows.length} / {rows.length}
      </p>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value}</dd>
    </div>
  )
}

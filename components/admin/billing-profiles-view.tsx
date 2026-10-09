'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Check, Copy, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { getBillingProfileCopy } from '@/lib/billing-profile-copy'
import { exportBillingProfilesCsvAction, listBillingProfileAccessHistoryAction, revealBillingProfileIdentifierAction } from '@/lib/billing-profile-actions'
import type { AdminBillingProfileRow, BillingProfileAccessHistoryRow, BillingProfileRevealField } from '@/lib/admin/billing-profile-data'
import type { BillingProfileExportFilter } from '@/lib/billing-profile-types'

export function BillingProfilesView({
  available,
  rows,
  history,
}: {
  available: boolean
  rows: AdminBillingProfileRow[]
  history: BillingProfileAccessHistoryRow[]
}) {
  const { lang } = useLanguage()
  const copy = getBillingProfileCopy(lang)
  const [filter, setFilter] = useState<BillingProfileExportFilter>('all')
  const [search, setSearch] = useState('')
  const [openUserId, setOpenUserId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [revealed, setRevealed] = useState<{ userId: string; field: BillingProfileRevealField; value: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [revealPending, setRevealPending] = useState(false)
  const revealTimer = useRef<number | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setRevealed(null)
    setCopied(false)
    if (revealTimer.current) window.clearTimeout(revealTimer.current)
  }, [filter, search, rows])

  useEffect(() => () => {
    if (revealTimer.current) window.clearTimeout(revealTimer.current)
  }, [])

  async function revealIdentifier(userId: string, field: BillingProfileRevealField) {
    setRevealPending(true)
    setFeedback(null)
    const result = await revealBillingProfileIdentifierAction(userId, field)
    setRevealPending(false)
    if (!result.ok) {
      const message = result.error === 'unauthorized' ? copy.revealUnauthorized : result.error === 'rate_limited' ? copy.revealRateLimited : result.error === 'audit_failed' ? copy.revealAuditFailed : copy.revealFailed
      setFeedback({ type: 'error', text: message })
      return
    }
    setRevealed({ userId, field, value: result.value })
    setCopied(false)
    if (revealTimer.current) window.clearTimeout(revealTimer.current)
    revealTimer.current = window.setTimeout(() => setRevealed(null), 30_000)
  }

  async function copyIdentifier() {
    if (!revealed) return
    await navigator.clipboard.writeText(revealed.value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

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
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${row.complete ? 'border-accent/40 bg-accent/15 text-accent-foreground' : 'border-primary/30 bg-primary/10 text-primary'}`}>
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
                          <Detail label={copy.subscriptionStatus} value={statusLabel(row.subscriptionStatus, copy)} />
                          {profile ? (
                            <>
                              <Detail label={copy.companyColumn} value={profile.companyTitle || '—'} />
                              <Detail label={copy.fullNameColumn} value={profile.fullName || '—'} />
                              <Detail label={copy.taxOfficeColumn} value={profile.taxOffice || '—'} />
                              <IdentifierDetail
                                label={profile.customerType === 'company' ? copy.vknLabel : copy.tcknLabel}
                                maskedValue={maskedId}
                                revealedValue={revealed?.userId === row.userId ? revealed.value : null}
                                onReveal={() => revealIdentifier(row.userId, profile.customerType === 'company' ? 'tax_number' : 'national_id')}
                                onCopy={copyIdentifier}
                                copied={copied && revealed?.userId === row.userId}
                                pending={revealPending}
                                copy={copy}
                              />
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
      <p className="text-xs leading-relaxed text-muted-foreground">{visibleRows.length} / {rows.length}</p>
      <section aria-labelledby="billing-access-history" className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
        <h3 id="billing-access-history" className="font-medium text-foreground">{copy.accessHistory}</h3>
        {history.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{copy.noAccessHistory}</p> : (
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            {history.map((entry) => <li key={entry.id} className="flex flex-wrap gap-x-2 gap-y-1"><span>{entry.adminEmail}</span><span>·</span><span>{entry.field === 'tax_number' ? copy.vknLabel : copy.tcknLabel}</span><span>·</span><time dateTime={entry.createdAt}>{new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</time></li>)}
          </ul>
        )}
      </section>
    </div>
  )
}

function statusLabel(status: string, copy: ReturnType<typeof getBillingProfileCopy>) {
  return ({ active: copy.statusActive, past_due: copy.statusPastDue, canceled: copy.statusCanceled, suspended: copy.statusSuspended } as Record<string, string>)[status] ?? copy.statusUnknown
}

function IdentifierDetail({ label, maskedValue, revealedValue, onReveal, onCopy, copied, pending, copy }: { label: string; maskedValue: string; revealedValue: string | null; onReveal: () => void; onCopy: () => void; copied: boolean; pending: boolean; copy: ReturnType<typeof getBillingProfileCopy> }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground"><span className="font-mono">{revealedValue ?? maskedValue}</span>{revealedValue ? <Button type="button" variant="outline" size="sm" onClick={onCopy} aria-label={copy.copy}>{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied ? copy.copied : copy.copy}</Button> : <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onReveal}>{pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}{copy.reveal}</Button>}</dd></div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value}</dd>
    </div>
  )
}

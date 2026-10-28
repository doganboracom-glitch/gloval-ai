'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Download, Loader2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { DataTable, PageHeader, StatusBadge, Td, Th, Tr } from '@/components/admin/admin-ui'
import { InvoiceDetailsDialog, NotRequiredDialog, UploadInvoiceDialog } from '@/components/admin/invoice-dialogs'
import { getInvoiceCopy, invoiceErrorText } from '@/lib/invoices/copy'
import { exportInvoicesCsvAction } from '@/lib/invoices/actions'
import { formatKurus } from '@/lib/invoices/scope'
import type { AdminInvoiceRow, InvoiceFilters, InvoiceListResult, InvoiceStatusFilter } from '@/lib/invoices/types'

const fieldClass = 'rounded-md border border-border bg-background px-3 py-2 text-sm'

type DialogState =
  | { kind: 'upload'; row: AdminInvoiceRow }
  | { kind: 'details'; row: AdminInvoiceRow }
  | { kind: 'mark'; ids: string[] }
  | null

export function InvoicesView({ result, filters }: { result: InvoiceListResult; filters: InvoiceFilters }) {
  const { lang } = useLanguage()
  const c = getInvoiceCopy(lang)
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState({ category: filters.category, from: filters.from, to: filters.to, q: filters.q, showTest: filters.showTest })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<DialogState>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [exporting, setExporting] = useState(false)

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }),
    [lang],
  )

  function navigate(next: Partial<InvoiceFilters & { page: number }>) {
    const merged = { ...filters, ...next }
    const params = new URLSearchParams()
    if (merged.status !== 'pending') params.set('status', merged.status)
    if (merged.category !== 'all') params.set('category', merged.category)
    if (merged.showTest) params.set('test', '1')
    if (merged.from) params.set('from', merged.from)
    if (merged.to) params.set('to', merged.to)
    if (merged.q) params.set('q', merged.q)
    if (merged.page > 1) params.set('page', String(merged.page))
    setSelected(new Set())
    startTransition(() => router.push(params.size ? `${pathname}?${params}` : pathname))
  }

  const tabs: Array<{ id: InvoiceStatusFilter; label: string; count: number }> = [
    { id: 'pending', label: c.tabPending, count: result.counts.pending },
    { id: 'uploaded', label: c.tabUploaded, count: result.counts.uploaded },
    { id: 'not_required', label: c.tabNotRequired, count: result.counts.not_required },
    { id: 'all', label: c.tabAll, count: result.counts.total },
  ]

  const selectable = result.rows.filter((row) => row.expectsInvoice ? !row.invoice : !row.invoice || row.invoice.status !== 'uploaded')
  const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row.transactionId))
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function exportCsv() {
    setExporting(true)
    setFeedback(null)
    const response = await exportInvoicesCsvAction({ ...filters, showTest: filters.showTest })
    setExporting(false)
    if (!response.ok) return setFeedback({ type: 'error', text: invoiceErrorText(c, response.error) })
    if (response.count === 0) return setFeedback({ type: 'error', text: c.exportEmpty })
    const blob = new Blob(['\ufeff', response.csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = response.filename
    link.click()
    URL.revokeObjectURL(url)
  }

  function done(message: string) {
    setDialog(null)
    setSelected(new Set())
    setFeedback({ type: 'success', text: message })
    router.refresh()
  }

  function statusBadge(row: AdminInvoiceRow) {
    if (row.invoice?.status === 'uploaded') return <StatusBadge tone="success" label={c.statusUploaded} />
    if (row.invoice?.status === 'not_required') return <StatusBadge tone="muted" label={c.statusNotRequired} />
    if (!row.expectsInvoice) return <StatusBadge tone="muted" label={c.statusTest} />
    return <StatusBadge tone="warning" label={c.statusPending} />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={c.title}
        subtitle={c.subtitle}
        action={
          <Button type="button" variant="outline" onClick={exportCsv} disabled={exporting || !result.available}>
            {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            {exporting ? c.exporting : c.exportCsv}
          </Button>
        }
      />

      {!result.available ? <p className="rounded-xl border border-border bg-card/70 px-4 py-6 text-sm text-muted-foreground">{c.unavailable}</p> : null}

      {feedback ? (
        <p
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-3 py-2 text-sm ${feedback.type === 'error' ? 'border-destructive/40 text-destructive' : 'border-border text-foreground'}`}
        >
          {feedback.text}
        </p>
      ) : null}

      <div role="tablist" aria-label={c.title} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filters.status === tab.id}
            onClick={() => navigate({ status: tab.id, page: 1 })}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              filters.status === tab.id ? 'border-brand/40 bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label} <span className="ml-1 font-mono text-xs">{tab.count}</span>
          </button>
        ))}
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          navigate({ ...draft, page: 1 })
        }}
      >
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">{c.category}</span>
          <select className={fieldClass} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as InvoiceFilters['category'] })}>
            <option value="all">{c.categoryAll}</option>
            {Object.entries(c.categories).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">{c.from}</span>
          <input type="date" className={fieldClass} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </label>
        <label className="text-xs text-muted-foreground">
          <span className="mb-1 block">{c.to}</span>
          <input type="date" className={fieldClass} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </label>
        <label className="min-w-48 flex-1 text-xs text-muted-foreground">
          <span className="sr-only">{c.search}</span>
          <input className={`${fieldClass} w-full`} placeholder={c.search} value={draft.q} maxLength={100} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={draft.showTest} onChange={(e) => setDraft({ ...draft, showTest: e.target.checked })} />
          {c.showTest}
        </label>
        <Button type="submit" disabled={isPending}>
          {c.apply}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setDraft({ category: 'all', from: '', to: '', q: '', showTest: false })
            navigate({ status: 'pending', category: 'all', from: '', to: '', q: '', showTest: false, page: 1 })
          }}
        >
          {c.reset}
        </Button>
      </form>

      {result.truncated ? <p className="text-xs text-muted-foreground">{c.truncated}</p> : null}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/70 px-3 py-2">
          <span className="text-sm">{c.selected.replace('{n}', String(selected.size))}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'mark', ids: [...selected] })}>
            {c.bulkMark}
          </Button>
        </div>
      ) : null}

      <div className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <DataTable
          isEmpty={result.rows.length === 0}
          empty={c.empty}
          head={
            <>
              <Th className="w-10">
                <input
                  type="checkbox"
                  aria-label={c.selectAll}
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((row) => row.transactionId)))}
                />
              </Th>
              <Th>{c.colDate}</Th>
              <Th>{c.colCustomer}</Th>
              <Th>{c.colType}</Th>
              <Th className="text-right">{c.colAmount}</Th>
              <Th>{c.colStatus}</Th>
              <Th className="text-right">{c.colActions}</Th>
            </>
          }
        >
          {result.rows.map((row) => {
            const uploaded = row.invoice?.status === 'uploaded'
            const canSelect = selectable.includes(row)
            return (
              <Tr key={row.transactionId}>
                <Td>
                  {canSelect ? (
                    <input type="checkbox" aria-label={c.selectRow} checked={selected.has(row.transactionId)} onChange={() => toggle(row.transactionId)} />
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">
                  {dateFmt.format(new Date(row.createdAt))}
                  <span className="block font-mono">{row.transactionNumber}</span>
                </Td>
                <Td>
                  <span className="block font-medium">{row.fullName || row.email}</span>
                  {row.fullName ? <span className="block text-xs text-muted-foreground">{row.email}</span> : null}
                  {row.expectsInvoice && !uploaded && row.profileComplete === false ? (
                    <span className="mt-1 inline-block text-xs text-amber-600 dark:text-amber-400">{c.profileIncomplete}</span>
                  ) : null}
                </Td>
                <Td>
                  <span className="block">{c.categories[row.category]}</span>
                  <span className="block max-w-56 truncate text-xs text-muted-foreground">{row.description}</span>
                </Td>
                <Td className="whitespace-nowrap text-right font-mono">{formatKurus(row.amountKurus)}</Td>
                <Td>
                  {statusBadge(row)}
                  {row.invoice?.invoiceNumber ? <span className="mt-1 block font-mono text-xs text-muted-foreground">{row.invoice.invoiceNumber}</span> : null}
                  {row.invoice?.notRequiredReason ? <span className="mt-1 block max-w-48 truncate text-xs text-muted-foreground">{row.invoice.notRequiredReason}</span> : null}
                </Td>
                <Td className="text-right">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {row.expectsInvoice ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: 'upload', row })}>
                        {uploaded ? c.replace : c.upload}
                      </Button>
                    ) : null}
                    {uploaded && row.invoice ? (
                      <a
                        href={`/api/admin/invoices/${row.invoice.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ size: 'sm', variant: 'ghost' })}
                      >
                        {c.download}
                      </a>
                    ) : null}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: 'details', row })}>
                      {c.details}
                    </Button>
                  </div>
                </Td>
              </Tr>
            )
          })}
        </DataTable>
      </div>

      {pages > 1 ? (
        <nav aria-label="pagination" className="flex items-center justify-between gap-3 text-sm">
          <Button type="button" variant="outline" size="sm" disabled={result.page <= 1 || isPending} onClick={() => navigate({ page: result.page - 1 })}>
            {c.prev}
          </Button>
          <span className="text-muted-foreground">{c.pageOf.replace('{page}', String(result.page)).replace('{pages}', String(pages))}</span>
          <Button type="button" variant="outline" size="sm" disabled={result.page >= pages || isPending} onClick={() => navigate({ page: result.page + 1 })}>
            {c.next}
          </Button>
        </nav>
      ) : null}

      {dialog?.kind === 'upload' ? <UploadInvoiceDialog row={dialog.row} onClose={() => setDialog(null)} onDone={done} /> : null}
      {dialog?.kind === 'details' ? <InvoiceDetailsDialog row={dialog.row} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'mark' ? <NotRequiredDialog transactionIds={dialog.ids} onClose={() => setDialog(null)} onDone={done} /> : null}
    </div>
  )
}

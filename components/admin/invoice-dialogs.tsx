'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { getInvoiceCopy, invoiceErrorText } from '@/lib/invoices/copy'
import { convertInvoiceToNotRequiredAction, getInvoiceDetailAction, markInvoicesNotRequiredAction, type InvoiceDetail } from '@/lib/invoices/actions'
import { revealBillingProfileIdentifierAction } from '@/lib/billing-profile-actions'
import { INVOICE_MAX_BYTES } from '@/lib/invoices/constants'
import type { AdminInvoiceRow } from '@/lib/invoices/types'

const fieldClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90svh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl outline-none"
      >
        <h3 id={titleId} className="font-display text-base font-semibold">
          {title}
        </h3>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

export function UploadInvoiceDialog({
  row,
  onClose,
  onDone,
}: {
  row: AdminInvoiceRow
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { lang } = useLanguage()
  const c = getInvoiceCopy(lang)
  const replacing = row.invoice?.status === 'uploaded'
  const [invoiceNumber, setInvoiceNumber] = useState(row.invoice?.invoiceNumber ?? '')
  const [invoiceDate, setInvoiceDate] = useState(row.invoice?.invoiceDate ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [refreshSnapshot, setRefreshSnapshot] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return setError(c.errors.invalid_input)
    if (file.size > INVOICE_MAX_BYTES) return setError(c.errors.too_large)
    setPending(true)
    setError(null)
    try {
      const body = new FormData()
      body.set('transactionId', row.transactionId)
      body.set('invoiceNumber', invoiceNumber)
      body.set('invoiceDate', invoiceDate)
      body.set('file', file)
      if (refreshSnapshot) body.set('refreshSnapshot', '1')
      const response = await fetch('/api/admin/invoices/upload', { method: 'POST', body })
      const result = (await response.json().catch(() => null)) as { ok: boolean; error?: string; replaced?: boolean } | null
      if (!result?.ok) {
        setError(invoiceErrorText(c, result?.error ?? 'save_failed'))
        return
      }
      onDone(result.replaced ? c.replaced : c.uploaded)
    } catch {
      setError(c.errors.save_failed)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal title={replacing ? c.replaceTitle : c.uploadTitle} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {row.transactionNumber} · {row.email}
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">{c.invoiceNumber}</span>
          <input className={fieldClass} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={64} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">{c.invoiceDate}</span>
          <input type="date" className={fieldClass} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">{c.file}</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            className={fieldClass}
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null
              setFile(picked)
              setError(picked && picked.size > INVOICE_MAX_BYTES ? c.errors.too_large : null)
            }}
            required
          />
        </label>
        {replacing ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={refreshSnapshot} onChange={(e) => setRefreshSnapshot(e.target.checked)} />
            <span>
              {c.refreshSnapshot}
              <span className="block text-xs text-muted-foreground">{c.refreshSnapshotHint}</span>
            </span>
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {c.cancel}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {pending ? c.saving : c.save}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function NotRequiredDialog({
  transactionIds,
  convertUploaded = false,
  onClose,
  onDone,
}: {
  transactionIds: string[]
  convertUploaded?: boolean
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { lang } = useLanguage()
  const c = getInvoiceCopy(lang)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    if (convertUploaded) {
      const converted = await convertInvoiceToNotRequiredAction(transactionIds[0], reason)
      setPending(false)
      if (!converted.ok) return setError(invoiceErrorText(c, converted.error))
      return onDone(c.marked.replace('{n}', '1'))
    }
    const result = await markInvoicesNotRequiredAction(transactionIds, reason)
    setPending(false)
    if (!result.ok) return setError(invoiceErrorText(c, result.error))
    const skipped = result.result.skipped.length
    onDone([c.marked.replace('{n}', String(result.result.marked)), skipped ? c.markedSkipped.replace('{n}', String(skipped)) : ''].filter(Boolean).join(' '))
  }

  return (
    <Modal title={convertUploaded ? c.convertTitle : c.reasonTitle} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {convertUploaded ? (
          <p className="text-sm text-destructive">{c.convertWarning}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{c.selected.replace('{n}', String(transactionIds.length))}</p>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">{c.reasonLabel}</span>
          <textarea className={fieldClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />
        </label>
        <p className="text-xs text-muted-foreground">{c.reasonHint}</p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {c.cancel}
          </Button>
          <Button type="submit" disabled={pending || reason.trim().length < 3}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {c.reasonSubmit}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}

export function InvoiceDetailsDialog({ row, onClose }: { row: AdminInvoiceRow; onClose: () => void }) {
  const { lang } = useLanguage()
  const c = getInvoiceCopy(lang)
  const [detail, setDetail] = useState<InvoiceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let active = true
    getInvoiceDetailAction(row.transactionId).then((result) => {
      if (!active) return
      if (result.ok) setDetail(result.detail)
      else setError(invoiceErrorText(c, result.error))
    })
    return () => {
      active = false
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [row.transactionId, c])

  async function reveal(field: 'national_id' | 'tax_number') {
    if (!detail?.userId) return
    const result = await revealBillingProfileIdentifierAction(detail.userId, field)
    if (!result.ok) return setError(invoiceErrorText(c, result.error === 'rate_limited' ? 'rate_limited' : 'unauthorized'))
    setRevealed(result.value)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setRevealed(null), 30_000)
  }

  const profile = detail?.profile
  const snapshot = detail?.snapshot
  const showSnapshot = snapshot?.profile
  const name = (v: { customerType?: string; companyTitle?: string; fullName?: string } | null | undefined) =>
    v?.customerType === 'company' ? v.companyTitle || v.fullName : v?.fullName

  return (
    <Modal title={c.detailsTitle} onClose={onClose}>
      <p className="mb-3 text-xs text-muted-foreground">
        {row.transactionNumber} · {row.email}
      </p>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!detail && !error ? <p className="text-sm text-muted-foreground">{c.detailsLoading}</p> : null}
      {detail ? (
        <div className="space-y-4">
          {showSnapshot ? (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.snapshotTitle}</h4>
              <dl className="mt-1 divide-y divide-border/60">
                <Line label="Ad / Unvan" value={name(snapshot)} />
                <Line label="Vergi dairesi" value={snapshot?.taxOffice} />
                <Line label="Adres" value={[snapshot?.addressLine, snapshot?.district, snapshot?.city].filter(Boolean).join(', ')} />
                <Line label="E-posta" value={snapshot?.invoiceEmail || snapshot?.accountEmail} />
              </dl>
            </section>
          ) : null}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.currentTitle}</h4>
            {profile ? (
              <>
                <dl className="mt-1 divide-y divide-border/60">
                  <Line label="Ad / Unvan" value={name(profile)} />
                  <Line label="Vergi dairesi" value={profile.taxOffice} />
                  <Line label="Adres" value={[profile.addressLine, profile.district, profile.city].filter(Boolean).join(', ')} />
                  <Line label="E-posta" value={profile.invoiceEmail} />
                  <Line label="T.C. / VKN" value={revealed ?? (profile.taxNumberLast3 ? `•••${profile.taxNumberLast3}` : profile.nationalIdLast3 ? `•••${profile.nationalIdLast3}` : null)} />
                </dl>
                {!revealed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => reveal(profile.hasTaxNumber ? 'tax_number' : 'national_id')}
                    disabled={!profile.hasTaxNumber && !profile.hasNationalId}
                  >
                    {c.revealTax}
                  </Button>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{c.detailsNone}</p>
            )}
          </section>
        </div>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          {c.close}
        </Button>
      </div>
    </Modal>
  )
}

'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { X, Loader2, ArrowLeft, CheckCircle2, CircleX, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { formatMoney } from '@/lib/billing-utils'
import { legalPath } from '@/lib/legal/documents'

export interface CheckoutBuyerInfo {
  buyerType: 'individual' | 'company'
  fullName: string
  email: string
  phone: string
  address: string
  taxId: string
}

export interface CheckoutItem {
  name: string
  priceCents: number
  currency: string
  /** true for subscriptions (recurring), false for one-time rights */
  recurring: boolean
}

/**
 * Pre-purchase legal gate required by Turkish distance-selling rules (Mesafeli
 * Sözleşmeler Yönetmeliği) and by PayTR's merchant review:
 *   1. Buyer/billing info is collected.
 *   2. The Distance Sales Agreement + Pre-Sale Information Form are shown/linked.
 *   3. Three consent checkboxes start UNCHECKED and the pay button stays
 *      disabled until all are ticked. Only then does `onConfirm` fire the real
 *      purchase action (which then redirects to PayTR).
 *
 * The dialog never fakes a payment; it just guarantees informed consent before
 * the existing checkout action runs.
 */
export function CheckoutConfirmDialog({
  open,
  item,
  defaultEmail,
  pending,
  paymentResult,
  onConfirm,
  onRetry,
  onClose,
}: {
  open: boolean
  item: CheckoutItem | null
  defaultEmail: string
  pending: boolean
  paymentResult?: 'success' | 'failed' | null
  onConfirm: (info: CheckoutBuyerInfo, paymentWindow: Window | null) => void
  onRetry?: () => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const c = t.billing.checkout

  const [buyerType, setBuyerType] = useState<'individual' | 'company'>('individual')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState(defaultEmail)
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [taxId, setTaxId] = useState('')

  const [okPreInfo, setOkPreInfo] = useState(false)
  const [okDistance, setOkDistance] = useState(false)

  const [touched, setTouched] = useState(false)
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({})

  if (!open || !item) return null

  const fieldErrors = {
    fullName: fullName.trim().length <= 1,
    email: !/.+@.+\..+/.test(email.trim()),
    phone: phone.trim().length <= 5,
    address: address.trim().length <= 5,
    taxId: taxId.trim().length === 0,
  }
  const infoComplete = !Object.values(fieldErrors).some(Boolean)
  const consentsGiven = okPreInfo && okDistance
  const requiredMessage = 'Bu alan zorunludur.'

  function fieldClass(field: keyof typeof fieldErrors) {
    return `${inputCls} ${touched && fieldErrors[field] ? 'border-destructive ring-1 ring-destructive/40' : ''}`
  }

  if (paymentResult) {
    const success = paymentResult === 'success'
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
        <div className="flex min-h-[260px] w-full max-w-md flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center shadow-2xl">
          {success ? (
            <CheckCircle2 className="size-14 text-emerald-500" aria-hidden="true" />
          ) : (
            <CircleX className="size-14 text-destructive" aria-hidden="true" />
          )}
          <h2 className="mt-5 font-display text-2xl font-bold text-foreground">
            {success ? 'Ödeme başarılı' : 'Ödeme başarısız'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {success
              ? 'Ödemeniz doğrulandı ve paketiniz aktif edildi.'
              : 'Ödeme işleminiz tamamlanamadı. Mevcut paketiniz korunuyor.'}
          </p>
          {!success && onRetry && (
            <Button className="mt-5" onClick={onRetry}>
              Tekrar ödeme yap
            </Button>
          )}
        </div>
      </div>
    )
  }


  function submit() {
    setTouched(true)
    const firstInvalid = (Object.keys(fieldErrors) as Array<keyof typeof fieldErrors>).find(
      (field) => fieldErrors[field],
    )
    if (firstInvalid) {
      requestAnimationFrame(() => {
        fieldRefs.current[firstInvalid]?.focus()
        fieldRefs.current[firstInvalid]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      return
    }
    if (!consentsGiven) return
    // Opened synchronously (before the async server action) so Chrome's popup
    // blocker sees it as a direct result of this click. The server round trip
    // to iyzico (cold serverless start + HMAC + the Sandbox initialize call)
    // can legitimately take a couple of seconds, during which a truly blank
    // `about:blank` tab looks identical to a stuck/broken one. Writing a
    // loading page into it immediately removes that ambiguity — the tab is
    // visibly "working" the whole time, and gets replaced by the real iyzico
    // page via `paymentWindow.location.replace(...)` once the redirect URL
    // comes back (or shows the error state if the server call fails).
    const paymentWindow = window.open('', '_blank')
    paymentWindow?.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>Ödeme sayfası hazırlanıyor</title>' +
        '<style>html,body{height:100%;margin:0;font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;display:flex;align-items:center;justify-content:center}' +
        '.wrap{text-align:center}.spinner{width:32px;height:32px;margin:0 auto 16px;border-radius:50%;border:3px solid rgba(245,245,245,.25);border-top-color:#f5f5f5;animation:spin 0.8s linear infinite}' +
        '@keyframes spin{to{transform:rotate(360deg)}}</style></head>' +
        '<body><div class="wrap"><div class="spinner"></div><p>Ödeme sayfası hazırlanıyor, lütfen bekleyin&hellip;</p></div></body></html>',
    )
    paymentWindow?.document.close()
    onConfirm({ buyerType, fullName, email, phone, address, taxId }, paymentWindow)
  }

  const inputCls =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <h2 className="font-display text-xl font-bold text-foreground">{c.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={c.back}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Order summary */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {c.product}
              </p>
              <p className="truncate font-medium text-foreground">{item.name}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-bold text-foreground">
                {formatMoney(item.priceCents, item.currency)}
              </p>
              <p className="text-[11px] text-muted-foreground">{c.vatIncluded}</p>
            </div>
          </div>

          {/* Buyer info */}
          <h3 className="mt-6 text-sm font-semibold text-foreground">{c.buyerInfo}</h3>

          <div className="mt-3 flex gap-2">
            {(['individual', 'company'] as const).map((bt) => (
              <button
                key={bt}
                type="button"
                onClick={() => setBuyerType(bt)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  buyerType === bt
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {bt === 'individual' ? c.individual : c.company}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 block">
              <span className="mb-1 block text-xs text-muted-foreground">
                {c.fullName}
              </span>
              <input
                className={fieldClass('fullName')}
                ref={(element) => { fieldRefs.current.fullName = element }}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                aria-invalid={touched && fieldErrors.fullName}
              />
              {touched && fieldErrors.fullName && (
                <span className="mt-1 block text-xs text-destructive">{requiredMessage}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">{c.email}</span>
              <input
                type="email"
                className={fieldClass('email')}
                ref={(element) => { fieldRefs.current.email = element }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                aria-invalid={touched && fieldErrors.email}
              />
              {touched && fieldErrors.email && (
                <span className="mt-1 block text-xs text-destructive">{requiredMessage}</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">{c.phone}</span>
              <input
                type="tel"
                className={fieldClass('phone')}
                ref={(element) => { fieldRefs.current.phone = element }}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                aria-invalid={touched && fieldErrors.phone}
              />
              {touched && fieldErrors.phone && (
                <span className="mt-1 block text-xs text-destructive">{requiredMessage}</span>
              )}
            </label>
            <label className="sm:col-span-2 block">
              <span className="mb-1 block text-xs text-muted-foreground">
                {c.address}
              </span>
              <input
                className={fieldClass('address')}
                ref={(element) => { fieldRefs.current.address = element }}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="street-address"
                aria-invalid={touched && fieldErrors.address}
              />
              {touched && fieldErrors.address && (
                <span className="mt-1 block text-xs text-destructive">{requiredMessage}</span>
              )}
            </label>
            <label className="sm:col-span-2 block">
              <span className="mb-1 block text-xs text-muted-foreground">{c.taxId}</span>
              <input
                className={fieldClass('taxId')}
                ref={(element) => { fieldRefs.current.taxId = element }}
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                aria-invalid={touched && fieldErrors.taxId}
              />
              {touched && fieldErrors.taxId && (
                <span className="mt-1 block text-xs text-destructive">{requiredMessage}</span>
              )}
            </label>
          </div>

          {/* Legal consents */}
          <h3 className="mt-6 text-sm font-semibold text-foreground">{c.legalTitle}</h3>
          <div className="mt-3 flex flex-col gap-3">
            <ConsentRow
              checked={okPreInfo}
              onChange={setOkPreInfo}
              label={c.consentPreInfo}
              href={legalPath('on-bilgilendirme-formu')}
              linkLabel={c.viewContract}
              invalid={touched && !okPreInfo}
            />
            <ConsentRow
              checked={okDistance}
              onChange={setOkDistance}
              label={c.consentDistance}
              href={legalPath('mesafeli-satis-sozlesmesi')}
              linkLabel={c.viewContract}
              invalid={touched && !okDistance}
            />
          </div>

          {touched && !consentsGiven && (
            <p className="mt-2 text-xs text-destructive">{c.required}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border p-6">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {c.back}
          </Button>
          <Button onClick={submit} disabled={pending} className="gap-2">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {c.pay}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ConsentRow({
  checked,
  onChange,
  label,
  href,
  linkLabel,
  invalid = false,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  href?: string
  linkLabel?: string
  invalid?: boolean
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors hover:border-primary/50 ${invalid ? 'border-destructive ring-1 ring-destructive/40' : 'border-border'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
      />
      <span className="min-w-0 flex-1 text-pretty text-foreground">
        {label}
        {href && linkLabel && (
          <>
            {' '}
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 font-medium text-brand underline underline-offset-2"
            >
              {linkLabel}
              <ExternalLink className="size-3" />
            </Link>
          </>
        )}
      </span>
    </label>
  )
}

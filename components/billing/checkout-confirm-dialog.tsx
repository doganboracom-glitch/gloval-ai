'use client'

import { useEffect, useState, type RefObject } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { X, Loader2, CheckCircle2, CircleX, ExternalLink, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { formatMoney } from '@/lib/billing-utils'
import { trackBeginCheckout } from '@/lib/analytics'
import { legalPath } from '@/lib/legal/documents'
import type { CheckoutConsents } from '@/lib/checkout-consent'
import {
  buildIyzicoIframeSrc,
  IYZICO_IFRAME_FALLBACK_DELAY_MS,
  isTrustedIyzicoCheckoutMessage,
  redirectIyzicoCheckoutToTopLevel,
} from '@/lib/iyzico-checkout-ui'

export interface CheckoutItem {
  name: string
  priceCents: number
  currency: string
  /** true for subscriptions (recurring), false for one-time rights */
  recurring: boolean
}

/**
 * Pre-purchase legal gate required by Turkish distance-selling rules (Mesafeli
 * Sözleşmeler Yönetmeliği) and by the payment provider's merchant review:
 *   1. Buyer/billing info is collected.
 *   2. The Distance Sales Agreement + Pre-Sale Information Form are shown/linked.
 *   3. Three consent checkboxes start UNCHECKED and the pay button stays
 *      disabled until all are ticked. Only then does `onConfirm` fire the real
 *      purchase action, which opens the secure iyzico checkout step.
 *
 * The dialog never fakes a payment; it preserves the informed-consent gate
 * before the existing checkout action runs.
 */
export function CheckoutConfirmDialog({
  open,
  item,
  defaultEmail,
  pending,
  profileComplete,
  onEditProfile,
  paymentUrl,
  iframeRef,
  paymentResult,
  onConfirm,
  onRetry,
  onClose,
}: {
  open: boolean
  item: CheckoutItem | null
  defaultEmail: string
  pending: boolean
  profileComplete: boolean
  onEditProfile: () => void
  paymentUrl: string | null
  iframeRef: RefObject<HTMLIFrameElement | null>
  paymentResult?: 'success' | 'failed' | null
  onConfirm: (consents: CheckoutConsents) => void
  onRetry: (consents: CheckoutConsents) => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const c = t.billing.checkout

  const [okPreInfo, setOkPreInfo] = useState(false)
  const [okDistance, setOkDistance] = useState(false)
  const [okWithdrawal, setOkWithdrawal] = useState(false)
  const [touched, setTouched] = useState(false)
  const [paymentStarted, setPaymentStarted] = useState(false)
  const [paymentMode, setPaymentMode] = useState<'idle' | 'iframe' | 'redirect'>('idle')
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [fallbackSuggested, setFallbackSuggested] = useState(false)

  useEffect(() => {
    if (!open) {
      setPaymentStarted(false)
      setPaymentMode('idle')
      setIframeLoaded(false)
      setFallbackSuggested(false)
      return
    }

    if (!paymentUrl) {
      setPaymentMode('idle')
      setIframeLoaded(false)
      setFallbackSuggested(false)
      return
    }

    setIframeLoaded(false)
    setFallbackSuggested(false)
    const redirectUrl = paymentUrl
    const userAgent = navigator.userAgent
    let redirected = false

    function redirectOnUnsupportedDevice() {
      if (redirected) return
      redirected = redirectIyzicoCheckoutToTopLevel(
        redirectUrl,
        userAgent,
        window.innerWidth,
        (url) => window.location.replace(url),
      )
      if (redirected) setPaymentMode('redirect')
    }

    redirectOnUnsupportedDevice()
    if (!redirected) setPaymentMode('iframe')
    window.addEventListener('resize', redirectOnUnsupportedDevice)
    return () => window.removeEventListener('resize', redirectOnUnsupportedDevice)
  }, [open, paymentUrl])

  useEffect(() => {
    if (!open || !paymentUrl || paymentMode !== 'iframe' || iframeLoaded) return
    const timeout = window.setTimeout(
      () => setFallbackSuggested(true),
      IYZICO_IFRAME_FALLBACK_DELAY_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [open, paymentUrl, paymentMode, iframeLoaded])

  useEffect(() => {
    if (!open || !paymentUrl || paymentMode !== 'iframe') return

    function handleIframeMessage(event: MessageEvent) {
      if (
        !isTrustedIyzicoCheckoutMessage(
          event,
          window.location.origin,
          iframeRef.current?.contentWindow ?? null,
        )
      ) {
        return
      }
      setIframeLoaded(true)
      setFallbackSuggested(false)
    }

    window.addEventListener('message', handleIframeMessage)
    return () => window.removeEventListener('message', handleIframeMessage)
  }, [open, paymentUrl, paymentMode, iframeRef])

  if (!open || !item) return null

  const consentsGiven = okPreInfo && okDistance && okWithdrawal

  function closeCheckout() {
    if (pending) return
    if (
      paymentStarted &&
      !paymentResult &&
      !window.confirm('Ödeme tamamlanmadı, çıkmak istiyor musun?')
    ) {
      return
    }
    setPaymentStarted(false)
    onClose()
  }

  function retryPayment() {
    if (!consentsGiven) return
    setPaymentStarted(true)
    onRetry({ preInfo: okPreInfo, distance: okDistance, withdrawal: okWithdrawal })
  }

  if (paymentResult === 'success') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-success-title"
          className="flex min-h-[260px] w-full max-w-md flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center shadow-2xl"
        >
          <CheckCircle2 className="size-14 text-brand" aria-hidden="true" />
          <h2 id="checkout-success-title" className="mt-5 font-display text-2xl font-bold text-foreground">
            Ödeme başarılı
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Ödemeniz doğrulandı ve paketiniz aktif edildi.
          </p>
        </section>
      </div>
    )
  }

  if (paymentResult === 'failed') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-failed-title"
          className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Güvenli ödeme</p>
              <h2 id="checkout-failed-title" className="mt-1 font-display text-xl font-bold text-foreground">
                Ödeme tamamlanamadı
              </h2>
            </div>
            <button
              type="button"
              onClick={closeCheckout}
              disabled={pending}
              aria-label="Kapat"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.product}</p>
                <p className="truncate font-medium text-foreground">{item.name}</p>
              </div>
              <p className="shrink-0 font-mono text-lg font-bold text-foreground">
                {formatMoney(item.priceCents, item.currency)}
              </p>
            </div>
            <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm leading-6 text-foreground">
              Ödeme tamamlanamadı. Kartınla ilgili bir sorun olabilir veya ödeme sistemi geçici olarak kullanılamıyor. Başka bir kartla dene ya da destek ile iletişime geç.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeCheckout} disabled={pending}>
                Kapat
              </Button>
              <Button type="button" onClick={retryPayment} disabled={pending}>
                {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Tekrar dene
              </Button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  if (paymentStarted) {
    const iframeSrc = paymentUrl ? buildIyzicoIframeSrc(paymentUrl) : null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-2 backdrop-blur-sm sm:p-4">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-payment-title"
          className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
        >
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground">
                <ShieldCheck aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-[0.14em] text-brand">GLOVAL</p>
                <h2 id="checkout-payment-title" className="truncate font-display text-lg font-bold text-foreground sm:text-xl">
                  Güvenli ödeme
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={closeCheckout}
              disabled={pending}
              aria-label="Kapat"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </header>

          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-muted/30 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.product}</p>
              <p className="truncate font-medium text-foreground">{item.name}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-lg font-bold text-foreground">
                {formatMoney(item.priceCents, item.currency)}
              </p>
              <p className="text-[11px] text-muted-foreground">{c.vatIncluded}</p>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:gap-4 sm:p-5">
            <div role="group" aria-label="Ödeme altyapıları" className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3">
                <Image src="/payment/iyzico-logo.svg" alt="iyzico" width={72} height={22} className="h-4 w-auto" />
              </span>
              <span className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3">
                <Image src="/payment/visa.svg" alt="Visa" width={42} height={24} className="h-5 w-auto" />
              </span>
              <span className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3">
                <Image src="/payment/mastercard.svg" alt="Mastercard" width={42} height={24} className="h-5 w-auto" />
              </span>
            </div>

            <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm leading-6 text-muted-foreground">
              <ShieldCheck className="mt-1 size-4 shrink-0 text-brand" aria-hidden="true" />
              <span>Ödemeniz iyzico güvencesiyle alınır, kart bilgileriniz GLOVAL&apos;a iletilmez.</span>
            </p>

            <div className="relative h-[min(56dvh,600px)] min-h-[220px] overflow-hidden rounded-xl border border-border bg-background">
              {paymentMode === 'iframe' && iframeSrc ? (
                <>
                  <iframe
                    ref={iframeRef}
                    src={iframeSrc}
                    title="iyzico güvenli ödeme"
                    onLoad={() => {
                      setIframeLoaded(true)
                      setFallbackSuggested(false)
                    }}
                    className={`size-full border-0 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                  {!iframeLoaded ? (
                    <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
                      <Loader2 className="size-7 animate-spin text-brand" aria-hidden="true" />
                      <p className="text-sm text-muted-foreground">Güvenli ödeme sayfası yükleniyor…</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div role="status" className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <Loader2 className="size-7 animate-spin text-brand" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    {paymentMode === 'redirect'
                      ? 'iyzico ödeme sayfasına yönlendiriliyorsunuz…'
                      : 'Ödeme sayfası hazırlanıyor…'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <footer className="flex shrink-0 flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            {paymentUrl ? (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  fallbackSuggested
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-border text-muted-foreground hover:border-brand/40 hover:text-foreground'
                }`}
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                {fallbackSuggested ? 'Ödeme ekranı açılmıyor mu? iyzico’da aç' : 'iyzico ödeme sayfasını yeni sekmede aç'}
              </a>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">Ödeme sayfası hazırlanıyor…</p>
            )}
            <Button type="button" variant="ghost" onClick={closeCheckout} disabled={pending}>
              Kapat
            </Button>
          </footer>
        </section>
      </div>
    )
  }

  function submit() {
    setTouched(true)
    if (!profileComplete || !consentsGiven) return
    setPaymentStarted(true)
    if (item) {
      trackBeginCheckout({
        value: item.priceCents / 100,
        currency: item.currency,
        item_category: item.recurring ? 'subscription' : 'one_time',
      })
    }
    onConfirm({ preInfo: okPreInfo, distance: okDistance, withdrawal: okWithdrawal })
  }

  const inputCls =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-confirm-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <h2 id="checkout-confirm-title" className="font-display text-xl font-bold text-foreground">{c.title}</h2>
          <button
            type="button"
            onClick={closeCheckout}
            disabled={pending}
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

          {/* Billing profile status */}
          <h3 className="mt-6 text-sm font-semibold text-foreground">{c.buyerInfo}</h3>
          <div
            className={`mt-3 flex flex-col gap-3 rounded-xl border p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${
              profileComplete ? 'border-border' : 'border-destructive ring-1 ring-destructive/40'
            }`}
          >
            <p className="text-pretty text-foreground">{profileComplete ? c.profileReady : c.profileMissing}</p>
            <Button type="button" variant="outline" size="sm" onClick={onEditProfile} disabled={pending}>
              {profileComplete ? c.editProfile : c.completeProfile}
            </Button>
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
            <ConsentRow
              checked={okWithdrawal}
              onChange={setOkWithdrawal}
              label={c.consentWithdrawal}
              invalid={touched && !okWithdrawal}
            />
          </div>

          {touched && !consentsGiven && (
            <p className="mt-2 text-xs text-destructive">{c.required}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border p-6">
          <Button variant="ghost" onClick={closeCheckout} disabled={pending}>
            {c.back}
          </Button>
          <Button onClick={submit} disabled={pending || !profileComplete} className="gap-2">
            {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
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

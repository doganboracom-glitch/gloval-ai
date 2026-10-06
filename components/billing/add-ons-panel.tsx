'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CircleX,
  Clock,
  ExternalLink,
  Loader2,
  Package,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import {
  CheckoutConfirmDialog,
  type CheckoutBuyerInfo,
  type CheckoutItem,
} from '@/components/billing/checkout-confirm-dialog'
import { formatMoney } from '@/lib/billing-utils'
import { ADD_ONS, isAddOnCode } from '@/lib/add-ons'
import type { AddOnCatalogItem, AddOnCode, AddOnKind, AddOnOverview } from '@/lib/add-ons'
import { purchaseAddOn } from '@/lib/addon-purchase-actions'
import {
  fillTemplate as fill,
  purchaseErrorMessage,
  type AddOnPurchaseOutcome,
  type PurchaseErrorCopy,
} from '@/lib/addon-purchase-outcome'

type Variant = 'summary' | 'full'

const ADD_ONS_PATH = '/billing/add-ons'

function closePaymentWindow(win?: Window | null) {
  try {
    if (win && !win.closed) win.close()
  } catch {
    // a window we no longer control cannot be closed; nothing to do
  }
}

function CapacityRow({
  label,
  base,
  addOn,
  total,
  baseLabel,
  addOnLabel,
  totalLabel,
  emptyLabel,
}: {
  label: string
  base: number | null
  addOn: number
  total: number | null
  baseLabel: string
  addOnLabel: string
  totalLabel: string
  emptyLabel: string
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="text-sm font-medium">{label}</p>
      {total === null || base === null ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{baseLabel}</dt>
            <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums">{base}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{addOnLabel}</dt>
            <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums">+{addOn}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{totalLabel}</dt>
            <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-brand">
              {total}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

export function AddOnCatalogGroup({
  kind,
  items,
  eligible,
  title,
  description,
  unitLabel,
  notEligible,
  notEligibleBadge,
  perMonth,
  periodNote,
  buyLabel,
  buyingLabel,
  onBuy,
  busyCode = null,
  purchaseLocked = false,
}: {
  kind: AddOnKind
  items: AddOnCatalogItem[]
  eligible: boolean
  title: string
  description: string
  unitLabel: string
  notEligible: string
  notEligibleBadge: string
  perMonth: string
  periodNote: string
  buyLabel: string
  buyingLabel: string
  /** Absent on read-only surfaces; present means a purchase can be started. */
  onBuy?: (code: AddOnCode) => void
  busyCode?: AddOnCode | null
  /** True while any purchase is in flight, so a second one cannot be started. */
  purchaseLocked?: boolean
}) {
  const Icon = kind === 'site' ? Building2 : Package
  return (
    <div
      className={`rounded-2xl border border-border bg-card/70 p-5 ${eligible ? '' : 'opacity-70'}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {eligible ? (
        <>
          <ul className="mt-4 grid gap-2 sm:grid-cols-3">
            {items.map((item) => {
              const busy = busyCode === item.code
              return (
                <li
                  key={item.code}
                  className="flex flex-col gap-1 rounded-xl border border-border bg-background/40 p-3"
                >
                  <span className="font-display text-base font-semibold">
                    {fill(unitLabel, { n: item.capacity })}
                  </span>
                  <span className="text-sm tabular-nums">
                    {formatMoney(item.priceCents, item.currency)}
                    <span className="text-muted-foreground"> {perMonth}</span>
                  </span>
                  {onBuy ? (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2 gap-2"
                      disabled={purchaseLocked}
                      aria-busy={busy}
                      data-addon-code={item.code}
                      onClick={() => onBuy(item.code)}
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                      {busy ? buyingLabel : buyLabel}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{periodNote}</p>
        </>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
            {notEligibleBadge}
          </span>
          <span>{notEligible}</span>
        </div>
      )}
    </div>
  )
}

export type AddOnOutcomeCopy = {
  successTitle: string
  successBody: string
  successTotal: string
  validUntil: string
  validityNote: string
  failedTitle: string
  failedBody: string
  pendingTitle: string
  pendingBody: string
  processingTitle: string
  processingBody: string
  reviewTitle: string
  reviewBody: string
  refreshStatus: string
  dismiss: string
}

/**
 * Result of the last payment. Success is only ever rendered for a purchase the
 * server has marked `granted`; every other stored state gets its own honest copy.
 */
export function AddOnOutcomeBanner({
  outcome,
  copy,
  unitLabel,
  newTotal,
  validUntilLabel,
  onRefresh,
  onDismiss,
}: {
  outcome: AddOnPurchaseOutcome
  copy: AddOnOutcomeCopy
  unitLabel: string
  newTotal: number | null
  validUntilLabel: string | null
  onRefresh?: () => void
  onDismiss?: () => void
}) {
  const view = {
    success: { Icon: CheckCircle2, tone: 'border-emerald-500/40 bg-emerald-500/10', icon: 'text-emerald-500', title: copy.successTitle, body: fill(copy.successBody, { item: unitLabel }) },
    failed: { Icon: CircleX, tone: 'border-destructive/40 bg-destructive/10', icon: 'text-destructive', title: copy.failedTitle, body: copy.failedBody },
    pending: { Icon: Clock, tone: 'border-border bg-muted/40', icon: 'text-muted-foreground', title: copy.pendingTitle, body: copy.pendingBody },
    processing: { Icon: Loader2, tone: 'border-border bg-muted/40', icon: 'text-muted-foreground', title: copy.processingTitle, body: copy.processingBody },
    review: { Icon: ShieldAlert, tone: 'border-amber-500/40 bg-amber-500/10', icon: 'text-amber-500', title: copy.reviewTitle, body: copy.reviewBody },
  }[outcome.state]
  const { Icon } = view
  const showRefresh = outcome.state === 'pending' || outcome.state === 'processing'

  return (
    <div
      role={outcome.state === 'failed' || outcome.state === 'review' ? 'alert' : 'status'}
      data-outcome={outcome.state}
      className={`mt-4 flex items-start gap-3 rounded-2xl border p-4 ${view.tone}`}
    >
      <Icon
        className={`mt-0.5 size-5 shrink-0 ${view.icon} ${outcome.state === 'processing' ? 'animate-spin' : ''}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-semibold">{view.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{view.body}</p>
        {outcome.state === 'success' ? (
          <ul className="mt-2 flex flex-col gap-0.5 text-sm">
            {newTotal !== null ? <li>{fill(copy.successTotal, { total: newTotal })}</li> : null}
            {validUntilLabel ? <li>{fill(copy.validUntil, { date: validUntilLabel })}</li> : null}
            <li className="text-xs text-muted-foreground">{copy.validityNote}</li>
          </ul>
        ) : null}
        {showRefresh && onRefresh ? (
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRefresh}>
            {copy.refreshStatus}
          </Button>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={copy.dismiss}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

export function AddOnsPanel({
  overview,
  variant,
  planName,
  userEmail = '',
  outcome = null,
}: {
  overview: AddOnOverview
  variant: Variant
  planName?: string | null
  userEmail?: string
  /** Server-derived result of the buyer's last purchase, from the stored status. */
  outcome?: AddOnPurchaseOutcome | null
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const a = t.billing.addOns
  const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' })
  const siteItems = overview.catalog.filter((c) => c.kind === 'site')
  const productItems = overview.catalog.filter((c) => c.kind === 'product')

  const [checkoutCode, setCheckoutCode] = useState<AddOnCode | null>(null)
  const [busyCode, setBusyCode] = useState<AddOnCode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [awaitingUrl, setAwaitingUrl] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const paymentWindowRef = useRef<Window | null>(null)

  const errorCopy: PurchaseErrorCopy = {
    unauthenticated: a.errUnauthenticated,
    noSubscription: a.errNoSubscription,
    subscriptionInactive: a.errSubscriptionInactive,
    invalidAddon: a.errInvalidAddon,
    notAvailable: a.errNotAvailable,
    notEligible: a.errNotEligible,
    purchaseInProgress: t.billing.paymentPending,
    paymentInitFailed: t.billing.paymentInitFailed,
    generic: t.billing.genericError,
  }

  const unitLabelFor = (code: AddOnCode) => {
    const def = ADD_ONS[code]
    return fill(def.kind === 'site' ? a.siteUnit : a.productUnit, { n: def.capacity })
  }

  function showResult() {
    setAwaitingUrl(null)
    paymentWindowRef.current = null
    router.replace(`${ADD_ONS_PATH}?payment=return`)
    router.refresh()
  }

  // The popup posts a message when the callback finishes, and closing it by
  // hand ends the wait too. Neither carries the result: both just ask the
  // server to re-read the stored purchase status.
  useEffect(() => {
    if (!awaitingUrl) return
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.data?.source !== 'gloval-payment') return
      showResult()
    }
    window.addEventListener('message', onMessage)
    const timer = window.setInterval(() => {
      const win = paymentWindowRef.current
      if (win && win.closed) showResult()
    }, 1000)
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(timer)
    }
    // showResult only uses stable refs/router
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingUrl])

  function openCheckout(code: AddOnCode) {
    if (!isAddOnCode(code)) return
    setError(null)
    setCheckoutCode(code)
  }

  function runPurchase(buyer: CheckoutBuyerInfo, paymentWindow: Window | null) {
    const code = checkoutCode
    if (!code) {
      closePaymentWindow(paymentWindow)
      return
    }
    setError(null)
    setBusyCode(code)
    startTransition(async () => {
      try {
        const res = await purchaseAddOn({
          addonCode: code,
          buyer: {
            fullName: buyer.fullName,
            phone: buyer.phone,
            address: buyer.address,
            taxId: buyer.taxId,
          },
        })
        setBusyCode(null)
        if (!res.ok) {
          closePaymentWindow(paymentWindow)
          setCheckoutCode(null)
          setError(purchaseErrorMessage(res.error, errorCopy))
          return
        }
        if (paymentWindow && !paymentWindow.closed) {
          paymentWindow.location.replace(res.redirectUrl)
          paymentWindowRef.current = paymentWindow
        } else {
          paymentWindowRef.current = window.open(res.redirectUrl, '_blank')
        }
        setCheckoutCode(null)
        setAwaitingUrl(res.redirectUrl)
      } catch {
        closePaymentWindow(paymentWindow)
        setBusyCode(null)
        setCheckoutCode(null)
        setError(t.billing.genericError)
      }
    })
  }

  const checkoutItem: CheckoutItem | null = (() => {
    if (!checkoutCode) return null
    const entry = overview.catalog.find((c) => c.code === checkoutCode)
    if (!entry) return null
    return {
      name: fill(a.checkoutItem, { item: unitLabelFor(entry.code) }),
      priceCents: entry.priceCents,
      currency: entry.currency,
      recurring: false,
    }
  })()

  const purchaseLocked = isPending || awaitingUrl !== null || checkoutCode !== null
  const canBuy = variant === 'full'

  const outcomeCopy: AddOnOutcomeCopy = {
    successTitle: a.successTitle,
    successBody: a.successBody,
    successTotal: '',
    validUntil: a.validUntil,
    validityNote: a.validityNote,
    failedTitle: a.failedTitle,
    failedBody: a.failedBody,
    pendingTitle: a.pendingTitle,
    pendingBody: a.pendingBody,
    processingTitle: a.processingTitle,
    processingBody: a.processingBody,
    reviewTitle: a.reviewTitle,
    reviewBody: a.reviewBody,
    refreshStatus: a.refreshStatus,
    dismiss: a.dismiss,
  }
  if (outcome) {
    outcomeCopy.successTotal = outcome.kind === 'site' ? a.successTotalSite : a.successTotalProduct
  }
  const outcomeTotal = outcome
    ? outcome.kind === 'site'
      ? overview.site.total
      : overview.product.total
    : null

  return (
    <section aria-labelledby="addons-heading" className="mt-8">
      {variant === 'full' ? (
        <Link
          href="/billing"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {a.backToBilling}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="addons-heading" className="font-display text-xl font-bold tracking-tight">
            {a.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {variant === 'full' ? a.subtitle : a.summaryHint}
          </p>
          {variant === 'full' && planName ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {a.planLabel}: <span className="font-medium text-foreground">{planName}</span>
            </p>
          ) : null}
        </div>
        {variant === 'summary' ? (
          <Link
            href={ADD_ONS_PATH}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {a.manage}
          </Link>
        ) : null}
      </div>

      {variant === 'full' && error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {variant === 'full' && awaitingUrl ? (
        <div
          role="status"
          data-awaiting-payment
          className="mt-4 flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4"
        >
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold">{a.awaitingTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{a.awaitingBody}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={awaitingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                {a.reopenPayment}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
              <Button type="button" size="sm" variant="ghost" onClick={showResult}>
                {a.refreshStatus}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {variant === 'full' && outcome && !awaitingUrl ? (
        <AddOnOutcomeBanner
          outcome={outcome}
          copy={outcomeCopy}
          unitLabel={unitLabelFor(outcome.addonCode)}
          newTotal={outcomeTotal}
          validUntilLabel={outcome.validUntil ? dateFmt.format(new Date(outcome.validUntil)) : null}
          onRefresh={() => router.refresh()}
          onDismiss={() => router.replace(ADD_ONS_PATH)}
        />
      ) : null}

      <div className="mt-4 rounded-2xl border border-border bg-card/70 p-5">
        <h3 className="text-sm font-medium text-muted-foreground">{a.capacityTitle}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <CapacityRow
            label={a.siteLimit}
            base={overview.site.base}
            addOn={overview.site.addOn}
            total={overview.site.total}
            baseLabel={a.planLimitLabel}
            addOnLabel={a.addOnLabel}
            totalLabel={a.totalLabel}
            emptyLabel={a.noProductLimit}
          />
          <CapacityRow
            label={a.productLimit}
            base={overview.product.base}
            addOn={overview.product.addOn}
            total={overview.product.total}
            baseLabel={a.planLimitLabel}
            addOnLabel={a.addOnLabel}
            totalLabel={a.totalLabel}
            emptyLabel={a.noProductLimit}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {fill(a.ecommerceNote, { n: overview.ecommerceSiteLimit })}
        </p>
      </div>

      {variant === 'full' ? (
        <>
          <div className="mt-4 rounded-2xl border border-border bg-card/70 p-5">
            <h3 className="text-sm font-medium text-muted-foreground">{a.activeTitle}</h3>
            {overview.active.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{a.noneActive}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {overview.active.map((item, index) => (
                  <li
                    key={`${item.code}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/40 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">
                      {fill(item.kind === 'site' ? a.siteUnit : a.productUnit, {
                        n: item.capacity,
                      })}
                    </span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                        {a.activeBadge}
                      </span>
                      {item.expiresAt
                        ? fill(a.expiresOn, { date: dateFmt.format(new Date(item.expiresAt)) })
                        : a.noExpiry}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{a.expiredHint}</p>
          </div>

          <div className="mt-4 grid gap-4">
            <AddOnCatalogGroup
              kind="site"
              items={siteItems}
              eligible={overview.site.eligible}
              title={a.siteGroup}
              description={a.siteGroupDesc}
              unitLabel={a.siteUnit}
              notEligible={a.notEligibleSite}
              notEligibleBadge={a.notEligibleBadge}
              perMonth={a.perMonth}
              periodNote={a.periodNote}
              buyLabel={a.buy}
              buyingLabel={a.buying}
              onBuy={canBuy ? openCheckout : undefined}
              busyCode={busyCode}
              purchaseLocked={purchaseLocked}
            />
            <AddOnCatalogGroup
              kind="product"
              items={productItems}
              eligible={overview.product.eligible}
              title={a.productGroup}
              description={a.productGroupDesc}
              unitLabel={a.productUnit}
              notEligible={a.notEligibleProduct}
              notEligibleBadge={a.notEligibleBadge}
              perMonth={a.perMonth}
              periodNote={a.periodNote}
              buyLabel={a.buy}
              buyingLabel={a.buying}
              onBuy={canBuy ? openCheckout : undefined}
              busyCode={busyCode}
              purchaseLocked={purchaseLocked}
            />
          </div>

          {!overview.site.eligible || !overview.product.eligible ? (
            <Link
              href="/billing"
              className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
            >
              {a.upgradeCta}
            </Link>
          ) : null}

          <CheckoutConfirmDialog
            open={checkoutCode !== null}
            item={checkoutItem}
            defaultEmail={userEmail}
            pending={isPending}
            onConfirm={runPurchase}
            onClose={() => setCheckoutCode(null)}
          />
        </>
      ) : null}
    </section>
  )
}

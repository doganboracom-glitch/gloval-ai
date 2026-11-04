'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  CircleX,
  Clock,
  ExternalLink,
  Loader2,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import {
  CheckoutConfirmDialog,
  type CheckoutItem,
} from '@/components/billing/checkout-confirm-dialog'
import { AddOnAllowanceCard } from '@/components/billing/add-on-allowance-card'
import { BILLING_PROFILE_HREF } from '@/lib/billing-profile-link'
import { getMailAddOnCopy } from '@/components/billing/mail-addon-copy'
import { ADD_ONS, isAddOnCode } from '@/lib/add-ons'
import type {
  AddOnBillingPeriod,
  AddOnCatalogItem,
  AddOnCode,
  AddOnOverview,
} from '@/lib/add-ons'
import { purchaseAddOn } from '@/lib/addon-purchase-actions'
import { closePendingCheckout } from '@/lib/payments/close-checkout-actions'
import type { CheckoutConsents } from '@/lib/checkout-consent'
import {
  fillTemplate as fill,
  purchaseErrorMessage,
  type AddOnPurchaseOutcome,
  type PurchaseErrorCopy,
} from '@/lib/addon-purchase-outcome'
import { isTrustedIyzicoCheckoutMessage } from '@/lib/iyzico-checkout-ui'

type Variant = 'summary' | 'full'

const ADD_ONS_PATH = '/billing/add-ons'

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
  profileComplete = false,
  planInterval = 'month',
}: {
  overview: AddOnOverview
  variant: Variant
  planName?: string | null
  /** Billing period of the buyer's main plan; preselects the matching add-on period. */
  planInterval?: AddOnBillingPeriod
  userEmail?: string
  /** Server-derived result of the buyer's last purchase, from the stored status. */
  outcome?: AddOnPurchaseOutcome | null
  /** Whether the saved billing profile is complete enough to pay. */
  profileComplete?: boolean
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const a = t.billing.addOns
  const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' })
  const websiteItems = overview.catalog.filter((c) => c.kind === 'site' && c.siteTarget)
  const productItems = overview.catalog.filter((c) => c.kind === 'product')
  const mailItems = overview.catalog.filter((c) => c.kind === 'mail')
  const mc = getMailAddOnCopy(lang)

  const [checkoutCode, setCheckoutCode] = useState<AddOnCode | null>(null)
  const [busyCode, setBusyCode] = useState<AddOnCode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [awaitingUrl, setAwaitingUrl] = useState<string | null>(null)
  const [paymentResult, setPaymentResult] = useState<'success' | 'failed' | null>(null)
  const [isPending, startTransition] = useTransition()
  const paymentIframeRef = useRef<HTMLIFrameElement | null>(null)
  const paymentStartedAtRef = useRef<number | null>(null)

  const errorCopy: PurchaseErrorCopy = {
    unauthenticated: a.errUnauthenticated,
    noSubscription: a.errNoSubscription,
    subscriptionInactive: a.errSubscriptionInactive,
    invalidAddon: a.errInvalidAddon,
    notAvailable: a.errNotAvailable,
    notEligible: a.errNotEligible,
    purchaseInProgress: t.billing.paymentPending,
    paymentInitFailed: t.billing.paymentInitFailed,
    paymentNotReady: t.billing.paymentNotReady,
    buyerInvalid: t.billing.buyerInvalidGeneric,
    billingProfileIncomplete: t.billing.billingProfileIncomplete,
    generic: t.billing.genericError,
  }

  const unitLabelFor = (code: AddOnCode) => {
    const def = ADD_ONS[code]
    if (def.kind === 'site' && def.siteTarget === 'corporate') {
      return fill(a.corporateSiteUnit, { n: def.capacity })
    }
    if (def.kind === 'site' && def.siteTarget === 'ecommerce') {
      return fill(a.ecommerceSiteUnit, { n: def.capacity })
    }
    if (def.kind === 'site' && def.saleEnabled === false) {
      return fill(a.legacySiteUnit, { n: def.capacity })
    }
    if (def.kind === 'mail' && (code === 'extra_mail_1' || code === 'extra_mail_5')) {
      return fill(def.capacity === 1 ? a.emailUnitOne : a.emailUnitMany, { n: def.capacity })
    }
    if (def.kind === 'mail' && def.saleEnabled === false) {
      return fill(a.legacyMailUnit, { n: def.capacity })
    }
    const template = def.kind === 'site' ? a.siteUnit : def.kind === 'mail' ? mc.unit : a.productUnit
    return fill(template, { n: def.capacity })
  }

  const websiteUnitLabelFor = (item: AddOnCatalogItem) => {
    const def = ADD_ONS[item.code]
    const template = def.siteTarget === 'ecommerce' ? a.ecommerceSiteUnit : a.corporateSiteUnit
    return fill(template, { n: item.capacity })
  }

  const productUnitLabelFor = (item: AddOnCatalogItem) => fill(a.productUnit, { n: item.capacity })

  const emailUnitLabelFor = (item: AddOnCatalogItem) =>
    fill(item.capacity === 1 ? a.emailUnitOne : a.emailUnitMany, { n: item.capacity })

  function showResult() {
    setAwaitingUrl(null)
    setPaymentResult(null)
    setCheckoutCode(null)
    router.replace(`${ADD_ONS_PATH}?payment=return`)
    router.refresh()
  }

  useEffect(() => {
    if (!awaitingUrl) return
    function onMessage(event: MessageEvent) {
      if (
        !isTrustedIyzicoCheckoutMessage(
          event,
          window.location.origin,
          paymentIframeRef.current?.contentWindow ?? null,
        )
      ) {
        return
      }
      const status = event.data.status
      setPaymentResult(status === 'success' ? 'success' : 'failed')
      setAwaitingUrl(null)
      setBusyCode(null)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [awaitingUrl])

  useEffect(() => {
    if (paymentResult !== 'success') return
    const timer = window.setTimeout(() => {
      setPaymentResult(null)
      setCheckoutCode(null)
      setAwaitingUrl(null)
      router.replace(`${ADD_ONS_PATH}?payment=return`)
      router.refresh()
    }, 1400)
    return () => window.clearTimeout(timer)
  }, [paymentResult, router])

  const canBuy = variant === 'full'

  function openCheckout(code: AddOnCode) {
    if (!canBuy || !isAddOnCode(code)) return
    setError(null)
    setCheckoutCode(code)
  }

  function runPurchase(consents: CheckoutConsents) {
    const code = checkoutCode
    if (!code) return
    setError(null)
    setBusyCode(code)
    startTransition(async () => {
      try {
        const res = await purchaseAddOn({ addonCode: code, consents })
        setBusyCode(null)
        if (!res.ok) {
          setCheckoutCode(null)
          setError('reason' in res ? t.billing.genericError : purchaseErrorMessage(res.error, errorCopy))
          return
        }
        setPaymentResult(null)
        paymentStartedAtRef.current = Date.now() - 60_000
        setAwaitingUrl(res.redirectUrl)
      } catch {
        setBusyCode(null)
        setCheckoutCode(null)
        setPaymentResult(null)
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
  const outcomeSiteTarget = outcome ? ADD_ONS[outcome.addonCode].siteTarget : undefined
  if (outcome) {
    outcomeCopy.successTotal =
      outcome.kind === 'site'
        ? outcomeSiteTarget === 'ecommerce'
          ? a.successTotalEcommerceSite
          : outcomeSiteTarget === 'corporate'
            ? a.successTotalCorporateSite
            : a.successTotalSite
        : outcome.kind === 'mail'
          ? mc.successTotal
          : a.successTotalProduct
  }
  const outcomeTotal = outcome
    ? outcome.kind === 'site'
      ? outcomeSiteTarget === 'ecommerce'
        ? overview.ecommerceSiteLimit
        : outcomeSiteTarget === 'corporate'
          ? overview.corporateSiteLimit
          : overview.site.total
      : outcome.kind === 'mail'
        ? overview.mail.total
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

      {variant === 'full' && awaitingUrl && checkoutCode === null ? (
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
          <CapacityRow
            label={mc.mailLimit}
            base={overview.mail.base}
            addOn={overview.mail.addOn}
            total={overview.mail.total}
            baseLabel={a.planLimitLabel}
            addOnLabel={a.addOnLabel}
            totalLabel={a.totalLabel}
            emptyLabel={a.noProductLimit}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {fill(a.ecommerceNote, {
            corporate: overview.corporateSiteLimit,
            ecommerce: overview.ecommerceSiteLimit,
          })}
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
                      {unitLabelFor(item.code)}
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
            {(
              [
                {
                  kind: 'site',
                  items: websiteItems,
                  title: a.websiteAllowanceTitle,
                  description: a.websiteAllowanceDescription,
                  selectLabel: a.websiteAllowanceSelectLabel,
                  unitLabelFor: websiteUnitLabelFor,
                  notEligible: a.notEligibleSite,
                },
                {
                  kind: 'product',
                  items: productItems,
                  title: a.productAllowanceTitle,
                  description: a.productAllowanceDescription,
                  selectLabel: a.productAllowanceSelectLabel,
                  unitLabelFor: productUnitLabelFor,
                  notEligible: a.notEligibleProduct,
                },
                {
                  kind: 'mail',
                  items: mailItems,
                  title: a.emailAllowanceTitle,
                  description: a.emailAllowanceDescription,
                  selectLabel: a.emailAllowanceSelectLabel,
                  unitLabelFor: emailUnitLabelFor,
                  notEligible: a.notEligibleMail,
                },
              ] as const
            ).map((card) => (
              <AddOnAllowanceCard
                key={card.kind}
                kind={card.kind}
                items={card.items}
                defaultPeriod={planInterval}
                title={card.title}
                description={card.description}
                selectLabel={card.selectLabel}
                optionLabel={a.allowanceOptionLabel}
                currencyLabel={a.priceCurrency}
                unavailableOptionLabel={a.optionUnavailable}
                availabilityHint={a.optionAvailabilityHint}
                unitLabelFor={card.unitLabelFor}
                notEligible={card.notEligible}
                notEligibleBadge={a.notEligibleBadge}
                periodLabels={{ month: a.allowancePerMonth, year: a.allowancePerYear }}
                yearlyBadge={a.yearlyBadge}
                periodNotes={{ month: a.periodNote, year: a.periodNoteYearly }}
                vatIncluded={t.billing.checkout.vatIncluded}
                buyLabel={a.buy}
                buySelectedAriaLabel={a.buySelectedAriaLabel}
                buyingLabel={a.buying}
                onBuy={openCheckout}
                busyCode={busyCode}
                purchaseLocked={purchaseLocked}
              />
            ))}
          </div>

          {!websiteItems.every((item) => item.eligible) || !overview.product.eligible ? (
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
            profileComplete={profileComplete}
            onEditProfile={() => router.push(BILLING_PROFILE_HREF)}
            paymentUrl={awaitingUrl}
            iframeRef={paymentIframeRef}
            paymentResult={paymentResult}
            onConfirm={runPurchase}
            onRetry={(consents) => {
              setPaymentResult(null)
              setError(null)
              runPurchase(consents)
            }}
            onClose={() => {
              if (awaitingUrl && !paymentResult) {
                const since = paymentStartedAtRef.current ?? Date.now() - 60_000
                void closePendingCheckout(since)
                  .then((outcome) => {
                    if (typeof outcome !== 'string') return
                    if (outcome === 'paid') showResult()
                  })
                  .catch(() => {
                    // Transient; the cron still reconciles it.
                  })
              }
              paymentStartedAtRef.current = null
              setCheckoutCode(null)
              setPaymentResult(null)
            }}
          />
        </>
      ) : null}
    </section>
  )
}

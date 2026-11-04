'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, Loader2 } from 'lucide-react'
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
  fillTemplate,
  purchaseErrorMessage,
  type AddOnPurchaseOutcome,
  type PurchaseErrorCopy,
} from '@/lib/addon-purchase-outcome'
import { isTrustedIyzicoCheckoutMessage } from '@/lib/iyzico-checkout-ui'
import { ADD_ONS_ANCHOR, PLANS_ANCHOR } from '@/components/billing/collapsible-add-ons-section'
import { addonCardId } from '@/lib/billing-addon-focus'
import { ADD_ON_PAYMENT_RETURN_QUERY } from '@/lib/billing-add-ons-route'

const ADD_ONS_RETURN_PATH = `/billing?${ADD_ON_PAYMENT_RETURN_QUERY}#${ADD_ONS_ANCHOR}`

export function AddOnAllowanceCards({
  overview,
  planInterval = 'month',
  userEmail = '',
  profileComplete = false,
  highlightedCode = null,
}: {
  overview: AddOnOverview
  /** Buyer plan period; yearly plans preselect the yearly add-on offer. */
  planInterval?: AddOnBillingPeriod
  userEmail?: string
  profileComplete?: boolean
  highlightedCode?: string | null
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const a = t.billing.addOns
  const websiteItems = overview.catalog.filter((item) => item.kind === 'site' && item.siteTarget)
  const productItems = overview.catalog.filter((item) => item.kind === 'product')
  const mailItems = overview.catalog.filter((item) => item.kind === 'mail')
  const mailCopy = getMailAddOnCopy(lang)

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
    const definition = ADD_ONS[code]
    if (definition.kind === 'site' && definition.siteTarget === 'corporate') {
      return fillTemplate(a.corporateSiteUnit, { n: definition.capacity })
    }
    if (definition.kind === 'site' && definition.siteTarget === 'ecommerce') {
      return fillTemplate(a.ecommerceSiteUnit, { n: definition.capacity })
    }
    if (definition.kind === 'site' && definition.saleEnabled === false) {
      return fillTemplate(a.legacySiteUnit, { n: definition.capacity })
    }
    if (definition.kind === 'mail' && (code === 'extra_mail_1' || code === 'extra_mail_5')) {
      return fillTemplate(
        definition.capacity === 1 ? a.emailUnitOne : a.emailUnitMany,
        { n: definition.capacity },
      )
    }
    if (definition.kind === 'mail' && definition.saleEnabled === false) {
      return fillTemplate(a.legacyMailUnit, { n: definition.capacity })
    }
    const template =
      definition.kind === 'site'
        ? a.siteUnit
        : definition.kind === 'mail'
          ? mailCopy.unit
          : a.productUnit
    return fillTemplate(template, { n: definition.capacity })
  }

  const websiteUnitLabelFor = (item: AddOnCatalogItem) => {
    const definition = ADD_ONS[item.code]
    const template =
      definition.siteTarget === 'ecommerce' ? a.ecommerceSiteUnit : a.corporateSiteUnit
    return fillTemplate(template, { n: item.capacity })
  }

  const productUnitLabelFor = (item: AddOnCatalogItem) =>
    fillTemplate(a.productUnit, { n: item.capacity })

  const emailUnitLabelFor = (item: AddOnCatalogItem) =>
    fillTemplate(item.capacity === 1 ? a.emailUnitOne : a.emailUnitMany, { n: item.capacity })

  function showResult() {
    setAwaitingUrl(null)
    setPaymentResult(null)
    setCheckoutCode(null)
    router.replace(ADD_ONS_RETURN_PATH)
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
      setPaymentResult(event.data.status === 'success' ? 'success' : 'failed')
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
      router.replace(ADD_ONS_RETURN_PATH)
      router.refresh()
    }, 1400)
    return () => window.clearTimeout(timer)
  }, [paymentResult, router])

  function openCheckout(code: AddOnCode) {
    if (!isAddOnCode(code)) return
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
        const result = await purchaseAddOn({ addonCode: code, consents })
        setBusyCode(null)
        if (!result.ok) {
          setCheckoutCode(null)
          setError(
            'reason' in result
              ? t.billing.genericError
              : purchaseErrorMessage(result.error, errorCopy),
          )
          return
        }
        setPaymentResult(null)
        paymentStartedAtRef.current = Date.now() - 60_000
        setAwaitingUrl(result.redirectUrl)
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
    const item = overview.catalog.find((candidate) => candidate.code === checkoutCode)
    if (!item) return null
    return {
      name: fillTemplate(a.checkoutItem, { item: unitLabelFor(item.code) }),
      priceCents: item.priceCents,
      currency: item.currency,
      recurring: false,
    }
  })()

  const purchaseLocked = isPending || awaitingUrl !== null || checkoutCode !== null
  const allowanceCards = [
    {
      kind: 'site' as const,
      items: websiteItems,
      title: a.websiteAllowanceTitle,
      description: a.websiteAllowanceDescription,
      yearlyDescription: a.websiteAllowanceDescriptionYearly,
      selectLabel: a.websiteAllowanceSelectLabel,
      unitLabelFor: websiteUnitLabelFor,
      notEligible: a.notEligibleSite,
    },
    {
      kind: 'product' as const,
      items: productItems,
      title: a.productAllowanceTitle,
      description: a.productAllowanceDescription,
      yearlyDescription: undefined,
      selectLabel: a.productAllowanceSelectLabel,
      unitLabelFor: productUnitLabelFor,
      notEligible: a.notEligibleProduct,
    },
    {
      kind: 'mail' as const,
      items: mailItems,
      title: a.emailAllowanceTitle,
      description: a.emailAllowanceDescription,
      yearlyDescription: a.emailAllowanceDescriptionYearly,
      selectLabel: a.emailAllowanceSelectLabel,
      unitLabelFor: emailUnitLabelFor,
      notEligible: a.notEligibleMail,
    },
  ]

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {awaitingUrl && checkoutCode === null ? (
        <div
          role="status"
          data-awaiting-payment
          className="flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4"
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

      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allowanceCards.map((card) => (
          <AddOnAllowanceCard
            key={card.kind}
            kind={card.kind}
            items={card.items}
            defaultPeriod={planInterval}
            title={card.title}
            description={card.description}
            yearlyDescription={card.yearlyDescription}
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
            highlightedCode={highlightedCode}
          />
        ))}
      </div>

      {!websiteItems.every((item) => item.eligible) || !overview.product.eligible ? (
        <Link
          href={`/billing#${PLANS_ANCHOR}`}
          className="inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
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
            const startedAt = paymentStartedAtRef.current ?? Date.now() - 60_000
            void closePendingCheckout(startedAt)
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
  )
}

'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  Loader2,
  Building2,
  ShoppingBag,
  Sparkles,
  Info,
  X,
  BadgeCheck,
} from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { BrandLogo } from '@/components/brand-logo'
import { SiteCapacityCard, CreditSummaryCard } from '@/components/billing/capacity-credits-cards'
import type { AddOnOverview } from '@/lib/add-ons'
import type { CreditSummary, SiteCapacity } from '@/lib/billing-summary'
import { Button } from '@/components/ui/button'
import { BillingProfileBanner } from '@/components/billing/billing-profile-banner'
import { BillingProfileCard } from '@/components/billing/billing-profile-card'
import type { BillingProfileSummary } from '@/lib/billing-profile-types'
import {
  subscribeToPlan,
  changePlan,
  renewSubscription,
  cancelSubscription,
  previewPlanChange,
} from '@/lib/billing'
import type {
  PlanRow,
  SubscriptionRow,
  TransactionRow,
  EntitlementRow,
  PlanChangePreview,
} from '@/lib/billing'
import { tenantHost } from '@/lib/domains'
import { purchaseBrandingRemoval } from '@/lib/project-entitlements'
import type { ProjectEntitlementItem } from '@/lib/project-entitlements'
import { PlanCard } from '@/components/pricing/plan-card'
import {
  CheckoutConfirmDialog,
  type CheckoutItem,
  type CheckoutBuyerInfo,
} from '@/components/billing/checkout-confirm-dialog'
import { purchaseCreditTopUp } from '@/lib/credit-topups'
import {
  CREDIT_TOPUPS,
  PLANS,
  getCreditTopUp,
  toPlanCode,
  type PlanCode,
} from '@/lib/pricing-config'
import {
  formatMoney,
  formatSignedMoney,
  daysUntil,
  BRANDING_REMOVAL_CODE,
  BILLING_TIME_ZONE,
} from '@/lib/billing-utils'

/**
 * The legal-gate dialog opens `window.open('about:blank', '_blank')`
 * synchronously on click (before the async server action resolves) so the
 * browser's popup blocker sees it as a direct result of user input. That
 * popup is only ever navigated to the real PSP redirect URL once the server
 * action succeeds; on any failure path it must be closed instead of left
 * sitting on a permanent blank tab.
 */
function closePaymentWindow(win?: Window | null) {
  try {
    if (win && !win.closed) win.close()
  } catch {
    // ignore — closing a window we no longer control is a no-op, not an error
  }
}

type Usage = { corporate: number; ecommerce: number }

/** Minimal site shape needed to pick a target for a per-site purchase. */
export type BillingProject = {
  id: string
  name: string
  slug: string | null
  published: boolean
}

export function BillingClient({
  plans,
  subscription,
  currentPlan,
  transactions,
  entitlements,
  projectEntitlements,
  projects,
  usage,
  addOns = null,
  siteCapacity = null,
  creditSummary,
  userEmail,
  billingProfile,
  billingProfileStorageAvailable,
  billingProfileDefaultFullName,
  hasActivePaidSubscription = false,
  publishProjectId = null,
  initialTopUpId = null,
}: {
  plans: PlanRow[]
  subscription: SubscriptionRow | null
  currentPlan: PlanRow | null
  transactions: TransactionRow[]
  entitlements: EntitlementRow[]
  projectEntitlements: ProjectEntitlementItem[]
  projects: BillingProject[]
  usage: Usage
  /** Server-resolved add-on capacity summary; null if it could not be loaded. */
  addOns?: AddOnOverview | null
  /** Server-computed publish capacity (effective limit incl. add-ons). */
  siteCapacity?: SiteCapacity | null
  /** Server-computed AI credit balance/period summary from the ledger. */
  creditSummary: CreditSummary
  userEmail: string
  billingProfile: BillingProfileSummary | null
  billingProfileStorageAvailable: boolean
  billingProfileDefaultFullName: string
  hasActivePaidSubscription?: boolean
  publishProjectId?: string | null
  /** Pack chosen in the out-of-credits modal; opens its checkout on arrival. */
  initialTopUpId?: string | null
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const [billingProfileComplete, setBillingProfileComplete] = useState(billingProfile?.complete ?? false)
  const [isPending, startTransition] = useTransition()
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCancel, setShowCancel] = useState(false)
  const [preview, setPreview] = useState<
    (PlanChangePreview & { ok: true; planId: string }) | null
  >(null)
  const [previewing, setPreviewing] = useState(false)

  // Per-site add-on purchase: the owner must always pick WHICH site the
  // one-time right applies to before any money moves.
  const [sitePicker, setSitePicker] = useState<PlanRow | null>(null)
  const [pickedProjectId, setPickedProjectId] = useState('')

  // Pre-purchase legal gate. `checkout` holds the item summary shown in the
  // dialog; `checkoutRun` is the real purchase action executed only after the
  // buyer fills billing info and ticks every consent.
  const [checkout, setCheckout] = useState<CheckoutItem | null>(null)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [paymentResult, setPaymentResult] = useState<'success' | 'failed' | null>(null)
  const [checkoutRun, setCheckoutRun] = useState<
    ((buyer: CheckoutBuyerInfo, paymentWindow: Window | null) => void) | null
  >(null)

  // Faturalama donemi secimi. Kullanici yillik bir pakete aboneyse panel
  // dogrudan yillik sekmesiyle acilir, boylece mevcut paketi gorunur kalir.
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>(
    currentPlan?.interval === 'year' ? 'year' : 'month',
  )

  const hasActiveSub =
    subscription != null &&
    ['trialing', 'active', 'past_due'].includes(subscription.status)

  const b = t.billing

  useEffect(() => {
    function handlePaymentMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.data?.source !== 'gloval-payment') return
      if (!paymentUrl) return

      if (event.data.status === 'success' || event.data.status === 'failed') {
        setPaymentResult(event.data.status)
        window.setTimeout(() => {
          setPaymentResult(null)
          setPaymentUrl(null)
          setCheckout(null)
          setCheckoutRun(null)
          setBusyPlanId(null)
          router.refresh()
        }, 1400)
      } else {
        setPaymentResult('failed')
        setPaymentUrl(null)
        setBusyPlanId(null)
      }
    }

    window.addEventListener('message', handlePaymentMessage)
    return () => window.removeEventListener('message', handlePaymentMessage)
  }, [paymentUrl, router, b.genericError])

  const intervalLabel = (p: PlanRow) =>
    p.interval === 'once' ? ` ${b.oneTime}` : p.interval === 'year' ? b.perYear : b.perMonth

  const statusLabel = (s: SubscriptionRow['status']) =>
    ({
      trialing: b.statusTrialing,
      active: b.statusActive,
  past_due: b.statusPastDue,
  suspended: b.statusSuspended,
  canceled: b.statusCanceled,
      incomplete: b.statusIncomplete,
    })[s]

  // Gecis yalnizca katalogda gercekten yillik bir satir varsa gosterilir.
  const hasYearlyPlans = useMemo(
    () => plans.some((p) => p.interval === 'year'),
    [plans],
  )

  // Secili doneme ait paketler. FREE gibi yalnizca aylik sunulan paketler
  // yillik sekmede de gorunur; aksi halde katalogdan tamamen kaybolurlardi.
  const visiblePlans = useMemo(() => {
    const namesAtInterval = new Set(
      plans.filter((p) => p.interval === billingInterval).map((p) => p.name),
    )
    return plans.filter((p) => {
      if (p.interval === billingInterval) return true
      if (p.interval === 'once') return true
      return !namesAtInterval.has(p.name)
    })
  }, [plans, billingInterval])

  // The real subscription action. For paid plans this runs only after the
  // legal gate is satisfied; free/trial plans call it directly (no buyer info
  // needed since nothing is charged).
  function runSubscribe(planId: string, buyer?: CheckoutBuyerInfo, paymentWindow?: Window | null) {
    setError(null)
    setBusyPlanId(planId)
    startTransition(async () => {
      try {
        const res = await subscribeToPlan(
          planId,
          buyer
            ? {
                fullName: buyer.fullName,
                phone: buyer.phone,
                address: buyer.address,
                taxId: buyer.taxId,
              }
            : undefined,
        )
        setBusyPlanId(null)
        if (!res.ok) {
          // The legal-gate dialog opens a blank popup up front (before the
          // async server action resolves) so the browser doesn't treat it as
          // a blocked popup. On any failure that popup must be closed rather
          // than left showing a permanent blank/about:blank tab.
          closePaymentWindow(paymentWindow)
          setCheckout(null)
          setCheckoutRun(null)
          setError(
            res.error === 'already_subscribed'
              ? b.alreadySubscribed
              : res.error === 'payment_pending'
                ? b.paymentPending
                : res.error === 'payment_init_failed'
                  ? b.paymentInitFailed
                  : b.genericError,
          )
          return
        }
        if (res.redirectUrl) {
          if (paymentWindow && !paymentWindow.closed) {
            paymentWindow.location.replace(res.redirectUrl)
          } else {
            window.open(res.redirectUrl, '_blank', 'noopener,noreferrer')
          }
          setPaymentUrl(res.redirectUrl)
          return
        }
        router.refresh()
      } catch (err) {
        console.log('[v0] runSubscribe: unexpected error', err)
        closePaymentWindow(paymentWindow)
        setBusyPlanId(null)
        setCheckout(null)
        setCheckoutRun(null)
        setError(b.genericError)
      }
    })
  }

  function handleSubscribe(planId: string) {
    setError(null)
    setPaymentUrl(null)
    const plan = plans.find((p) => p.id === planId)
    // Free plans and free trials involve no immediate charge, so the distance
    // sales / pre-info gate does not apply — subscribe straight away.
    const isPaidNow = !!plan && plan.price_cents > 0 && plan.trial_days === 0
    if (!plan || !isPaidNow) {
      runSubscribe(planId)
      return
    }
    // Paid: open the legal gate; the purchase fires from the dialog.
    setCheckout({
      name: plan.name,
      priceCents: plan.price_cents,
      currency: plan.currency,
      recurring: plan.interval !== 'once',
    })
    setCheckoutRun(() => (buyer: CheckoutBuyerInfo, paymentWindow: Window | null) => runSubscribe(planId, buyer, paymentWindow))
  }

  // The plan shown on the subscription card. A suspended subscription is not
  // "active", so `currentPlan` may be null there; fall back to the sub's plan.
  const shownPlan =
    currentPlan ?? (subscription ? (plans.find((p) => p.id === subscription.plan_id) ?? null) : null)

  // Payment is owed for the next period: failed renewal (past_due), suspended
  // after the grace window, or a period that ended without a settled renewal.
  const needsRenewal =
    subscription != null &&
    (subscription.status === 'past_due' ||
      subscription.status === 'suspended' ||
      (subscription.status === 'active' && !!subscription.period_expired)) &&
    !subscription.cancel_at_period_end &&
    shownPlan != null &&
    shownPlan.price_cents > 0 &&
    shownPlan.interval !== 'once'

  function runRenew(
    buyer?: CheckoutBuyerInfo,
    paymentWindow?: Window | null,
    yearlyPlanId?: string,
  ) {
    setError(null)
    setBusyPlanId(yearlyPlanId ?? null)
    startTransition(async () => {
      try {
        const res = await renewSubscription(
          buyer
            ? {
                fullName: buyer.fullName,
                phone: buyer.phone,
                address: buyer.address,
                taxId: buyer.taxId,
              }
            : undefined,
          yearlyPlanId,
        )
        setBusyPlanId(null)
        if (!res.ok) {
          closePaymentWindow(paymentWindow)
          setCheckout(null)
          setCheckoutRun(null)
          setError(
            res.error === 'payment_pending'
              ? b.paymentPending
              : res.error === 'payment_init_failed'
                ? b.paymentInitFailed
                : b.genericError,
          )
          return
        }
        if (res.redirectUrl) {
          if (paymentWindow && !paymentWindow.closed) {
            paymentWindow.location.replace(res.redirectUrl)
          } else {
            window.open(res.redirectUrl, '_blank', 'noopener,noreferrer')
          }
          setPaymentUrl(res.redirectUrl)
          return
        }
        setCheckout(null)
        setCheckoutRun(null)
        router.refresh()
      } catch (err) {
        console.log('[v0] runRenew: unexpected error', err)
        closePaymentWindow(paymentWindow)
        setCheckout(null)
        setCheckoutRun(null)
        setError(b.genericError)
      }
    })
  }

  function handleRenew() {
    if (!shownPlan) return
    setError(null)
    setPaymentUrl(null)
    setCheckout({
      name: `${shownPlan.name} — ${b.renewItemSuffix}`,
      priceCents: shownPlan.price_cents,
      currency: shownPlan.currency,
      recurring: true,
    })
    setCheckoutRun(
      () => (buyer: CheckoutBuyerInfo, paymentWindow: Window | null) =>
        runRenew(buyer, paymentWindow),
    )
  }

  // Monthly -> yearly of the same tier goes through the renewal checkout; the
  // server re-reads the price from the catalog and only accepts the yearly
  // sibling of the current plan.
  function handleSwitchToYearly(yearlyPlan: PlanRow) {
    setError(null)
    setPaymentUrl(null)
    setCheckout({
      name: `${yearlyPlan.name} — ${b.yearlySwitchItemSuffix}`,
      priceCents: yearlyPlan.price_cents,
      currency: yearlyPlan.currency,
      recurring: true,
    })
    setCheckoutRun(
      () => (buyer: CheckoutBuyerInfo, paymentWindow: Window | null) =>
        runRenew(buyer, paymentWindow, yearlyPlan.id),
    )
  }

  // Sites that do not already hold the branding-removal right.
  const brandingOwnedIds = useMemo(
    () =>
      new Set(
        projectEntitlements
          .filter((e) => e.code === BRANDING_REMOVAL_CODE && e.status === 'active')
          .map((e) => e.project_id),
      ),
    [projectEntitlements],
  )

  const eligibleProjects = useMemo(
    () => projects.filter((p) => !brandingOwnedIds.has(p.id)),
    [projects, brandingOwnedIds],
  )

  function openSitePicker(plan: PlanRow) {
    setError(null)
    setPickedProjectId(eligibleProjects[0]?.id ?? '')
    setSitePicker(plan)
  }

  function runSitePurchase(projectId: string, planId: string, buyer?: CheckoutBuyerInfo, paymentWindow?: Window | null) {
    setBusyPlanId(planId)
    startTransition(async () => {
      try {
        const res = await purchaseBrandingRemoval(
          projectId,
          buyer
            ? {
                fullName: buyer.fullName,
                phone: buyer.phone,
                address: buyer.address,
                taxId: buyer.taxId,
              }
            : undefined,
        )
        setBusyPlanId(null)
        if (!res.ok) {
          closePaymentWindow(paymentWindow)
          setCheckout(null)
          setCheckoutRun(null)
          setError(res.error === 'already_owned' ? b.alreadyOwned : b.genericError)
          return
        }
        if (res.redirectUrl) {
          if (paymentWindow && !paymentWindow.closed) {
            paymentWindow.location.replace(res.redirectUrl)
          } else {
            window.open(res.redirectUrl, '_blank', 'noopener,noreferrer')
          }
          setPaymentUrl(res.redirectUrl)
          return
        }
        router.refresh()
      } catch (err) {
        console.log('[v0] runSitePurchase: unexpected error', err)
        closePaymentWindow(paymentWindow)
        setBusyPlanId(null)
        setCheckout(null)
        setCheckoutRun(null)
        setError(b.genericError)
      }
    })
  }

  // After the site is chosen, hand off to the same legal gate before charging.
  function confirmSitePurchase() {
    if (!sitePicker || !pickedProjectId) return
    setPaymentUrl(null)
    const projectId = pickedProjectId
    const plan = sitePicker
    setSitePicker(null)
    setCheckout({
      name: plan.name,
      priceCents: plan.price_cents,
      currency: plan.currency,
      recurring: false,
    })
    setCheckoutRun(
      () => (buyer: CheckoutBuyerInfo, paymentWindow: Window | null) => runSitePurchase(projectId, plan.id, buyer, paymentWindow),
    )
  }

  function runTopUpPurchase(packId: string, buyer?: CheckoutBuyerInfo, paymentWindow?: Window | null) {
    setError(null)
    setBusyPlanId(packId)
    startTransition(async () => {
      try {
        const res = await purchaseCreditTopUp(
          packId,
          buyer
            ? {
                fullName: buyer.fullName,
                phone: buyer.phone,
                address: buyer.address,
                taxId: buyer.taxId,
              }
            : undefined,
        )
        setBusyPlanId(null)
        if (!res.ok) {
          closePaymentWindow(paymentWindow)
          setCheckout(null)
          setCheckoutRun(null)
          setError(
            res.error === 'payment_init_failed'
              ? b.paymentInitFailed
              : b.genericError,
          )
          return
        }
        if (res.redirectUrl) {
          if (paymentWindow && !paymentWindow.closed) {
            paymentWindow.location.replace(res.redirectUrl)
          } else {
            window.open(res.redirectUrl, '_blank', 'noopener,noreferrer')
          }
          setPaymentUrl(res.redirectUrl)
          return
        }
        closePaymentWindow(paymentWindow)
        setCheckout(null)
        setCheckoutRun(null)
        router.refresh()
      } catch (err) {
        console.log('[v0] runTopUpPurchase: unexpected error', err)
        closePaymentWindow(paymentWindow)
        setBusyPlanId(null)
        setCheckout(null)
        setCheckoutRun(null)
        setError(b.genericError)
      }
    })
  }

  function handleTopUp(packId: string) {
    const pack = getCreditTopUp(packId)
    if (!pack) return
    setError(null)
    setPaymentUrl(null)
    setCheckout({
      name: `Ek AI paketi: +${pack.credits} AI işlemi`,
      priceCents: pack.priceCents,
      currency: pack.currency,
      recurring: false,
    })
    setCheckoutRun(
      () => (buyer: CheckoutBuyerInfo, paymentWindow: Window | null) =>
        runTopUpPurchase(pack.id, buyer, paymentWindow),
    )
  }

  useEffect(() => {
    if (initialTopUpId && getCreditTopUp(initialTopUpId)) handleTopUp(initialTopUpId)
    // Only on arrival from the out-of-credits modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopUpId])

  async function openPreview(planId: string) {
    setError(null)
    setPreviewing(true)
    setBusyPlanId(planId)
    try {
      const res = await previewPlanChange(planId)
      if (!res.ok) {
        setError(b.genericError)
        setBusyPlanId(null)
      } else {
        setPreview({ ...res, planId })
      }
    } catch {
      setError(b.genericError)
      setBusyPlanId(null)
    } finally {
      setPreviewing(false)
    }
  }

  function runChange(planId: string, buyer?: CheckoutBuyerInfo, paymentWindow?: Window | null) {
    setError(null)
    setBusyPlanId(planId)
    startTransition(async () => {
      try {
        const res = await changePlan(
          planId,
          buyer
            ? { fullName: buyer.fullName, phone: buyer.phone, address: buyer.address, taxId: buyer.taxId }
            : undefined,
        )
        setBusyPlanId(null)
        if (!res.ok) {
          closePaymentWindow(paymentWindow)
          setCheckout(null)
          setCheckoutRun(null)
          setError(
            res.error === 'payment_init_failed'
              ? b.paymentInitFailed
              : b.genericError,
          )
          return
        }
        if (res.redirectUrl) {
          if (paymentWindow && !paymentWindow.closed) {
            paymentWindow.location.replace(res.redirectUrl)
          } else {
            window.open(res.redirectUrl, '_blank', 'noopener,noreferrer')
          }
          setPaymentUrl(res.redirectUrl)
          return
        }
        setCheckout(null)
        setCheckoutRun(null)
        setPreview(null)
        router.refresh()
      } catch (err) {
        console.log('[v0] runChange: unexpected error', err)
        closePaymentWindow(paymentWindow)
        setBusyPlanId(null)
        setCheckout(null)
        setCheckoutRun(null)
        setError(b.genericError)
      }
    })
  }

  function confirmChange() {
    if (!preview) return
    const currentPreview = preview
    setPreview(null)
    setCheckout({
      name: `${currentPreview.currentPlanName} → ${currentPreview.newPlanName} Paket Yükseltme`,
      priceCents: currentPreview.netCents,
      currency: currentPreview.currency,
      recurring: false,
    })
    setCheckoutRun(() => (buyer: CheckoutBuyerInfo, paymentWindow: Window | null) => runChange(currentPreview.planId, buyer, paymentWindow))
  }

  function handleCancel(immediate: boolean) {
    setError(null)
    startTransition(async () => {
      const res = await cancelSubscription(immediate)
      setShowCancel(false)
      if (!res.ok) {
        setError(b.genericError)
        return
      }
      router.refresh()
    })
  }

  // Ana sayfadaki 4 pazarlama paketini (FREE/STARTER/PRO/E-TİCARET) veritabanı
  // paketlerine eşler. `visiblePlans` zaten seçili döneme (aylık/yıllık) göre
  // filtrelendiği için burada yalnızca abonelik dışı eklentileri (ör. marka
  // kaldırma) eleyip pazarlama koduna göre eşleşen satırı buluyoruz.
  const dbPlanFor = (code: PlanCode): PlanRow | undefined =>
    visiblePlans.find(
      (p) =>
        (p.product_category ?? 'corporate') !== 'addon' &&
        p.code !== BRANDING_REMOVAL_CODE &&
        toPlanCode(p.code) === code,
    )

  // Aktif ödeme dönemine karşılık gelen pazarlama cycle değeri.
  const marketingCycle = billingInterval === 'year' ? 'yearly' : 'monthly'

  // Kullanıcının içinde bulunduğu paket kademesi (kart vurgusu için).
  const activePlanCode: PlanCode | undefined =
    hasActiveSub && currentPlan ? toPlanCode(currentPlan.code) : undefined

  // Kullanıcının sahip olduğu (askıya alınmış dahil) ücretli paket ve kademesi.
  const ownedPlan =
    subscription != null &&
    ['trialing', 'active', 'past_due', 'suspended'].includes(subscription.status)
      ? shownPlan
      : null
  const ownedTier: PlanCode | undefined = ownedPlan ? toPlanCode(ownedPlan.code) : undefined
  const canSwitchToYearly =
    subscription != null &&
    ['active', 'past_due', 'suspended'].includes(subscription.status) &&
    !subscription.cancel_at_period_end &&
    ownedPlan != null &&
    ownedPlan.interval === 'month' &&
    ownedPlan.price_cents > 0

  // Kart vurgusu yalnızca aynı faturalama dönemindeki karta verilir (FREE
  // yalnızca aylık sunulduğu için her sekmede vurgulanır).
  const highlightedPlanCode: PlanCode | undefined =
    activePlanCode &&
    currentPlan &&
    (activePlanCode === 'free' || currentPlan.interval === billingInterval)
      ? activePlanCode
      : undefined

  // Paket kademesi sıralaması (PLANS dizi düzeni: free < starter < pro <
  // ecommerce). Kullanıcı yalnızca içinde bulunduğundan daha üst bir pakete
  // geçebilsin diye kartları bu sıraya göre kıyaslıyoruz.
  const planRank = (code: PlanCode) => PLANS.findIndex((p) => p.code === code)
  const currentRank = activePlanCode ? planRank(activePlanCode) : -1

  // Pazarlama kartının içine gerçek abonelik aksiyonunu enjekte eder; böylece
  // yeni tasarım korunurken abone ol / paket yükselt / deneme başlat çalışır.
  function renderPlanCta(code: PlanCode) {
    const dbPlan = dbPlanFor(code)
    const rank = planRank(code)

    // Aynı kademe, farklı faturalama dönemi: yalnızca aynı dönemdeki kart
    // "Mevcut"tur. Aylık abonelik için yıllık kart satın alınabilir; yıllık
    // abonelikte aylık kart dönem sonuna kadar pasif kalır.
    if (
      ownedPlan &&
      ownedTier === code &&
      dbPlan &&
      dbPlan.id !== ownedPlan.id &&
      dbPlan.interval !== ownedPlan.interval
    ) {
      if (canSwitchToYearly && dbPlan.interval === 'year') {
        const busy = busyPlanId === dbPlan.id && isPending
        return (
          <Button className="w-full" disabled={busy} onClick={() => handleSwitchToYearly(dbPlan)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : b.switchToYearly}
          </Button>
        )
      }
      return (
        <Button variant="outline" className="w-full" disabled>
          {ownedPlan.interval === 'year' ? b.yearlyActive : b.currentBadge}
        </Button>
      )
    }

    // Aktif paketin kendisi: sadece "Mevcut" rozeti gösterilir.
    if (activePlanCode === code) {
      return (
        <Button variant="outline" className="w-full" disabled>
          {b.currentBadge}
        </Button>
      )
    }

    // Mevcut paketten daha alt kademeler seçilemez; yalnızca bilgi amaçlı.
    if (currentRank >= 0 && rank <= currentRank) {
      return (
        <Button variant="outline" className="w-full" disabled>
          {b.lowerTier}
        </Button>
      )
    }

    // FREE ya da bu dönemde satılmayan bir kademe: gerçek bir abonelik satırı
    // yok.
    if (!dbPlan) {
      if (code === 'free') {
        return (
          <Button variant="outline" className="w-full" disabled>
            {b.currentBadge}
          </Button>
        )
      }
      return (
        <Button variant="outline" className="w-full" disabled>
          {b.noYearlyPlan}
        </Button>
      )
    }

    const busy = busyPlanId === dbPlan.id && (isPending || previewing)

    // Aktif aboneliği olan kullanıcı üst pakete geçiş yapar (yükseltme).
    if (hasActiveSub) {
      return (
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => void openPreview(dbPlan.id)}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : b.changePlan}
        </Button>
      )
    }
    return (
      <Button
        className="w-full"
        disabled={busy}
        onClick={() => handleSubscribe(dbPlan.id)}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : dbPlan.trial_days > 0 ? (
          b.startTrial
        ) : (
          b.subscribe
        )}
      </Button>
    )
  }

  // Katalogda kalan abonelik dışı eklentiler (ör. tek seferlik marka kaldırma).
  const addonPlans = useMemo(
    () =>
      visiblePlans.filter(
        (p) =>
          (p.product_category ?? 'corporate') === 'addon' ||
          p.code === BRANDING_REMOVAL_CODE,
      ),
    [visiblePlans],
  )

  // Pinned to GLOVAL AI's billing timezone (not the viewer's local one) so a
  // renewal date computed server-side never appears a day early/late here.
  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: BILLING_TIME_ZONE,
  })

  const txnKindLabel = (k: TransactionRow['kind']) =>
    ({
      charge: b.txnCharge,
      proration_credit: b.txnProrationCredit,
      proration_debit: b.txnProrationDebit,
      refund: b.txnRefund,
    })[k]

  return (
    <div className="relative min-h-svh">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="GLOVAL AI" className="flex shrink-0 items-center">
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <span className="hidden text-sm text-muted-foreground sm:inline">{userEmail}</span>
          </div>
        </header>

        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {b.backToDashboard}
        </Link>

        <div className="mt-4">
          <h1 className="font-display text-3xl font-bold tracking-tight text-balance">
            {b.title}
          </h1>
          <p className="mt-1 text-muted-foreground">{b.subtitle}</p>
        </div>

        {publishProjectId && (
          <div
            role="status"
            className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm"
          >
            <span>{hasActiveSub ? t.publish.planActivated : t.publish.planRequiredBody}</span>
            {hasActiveSub && (
              <Link
                href={`/editor/${publishProjectId}?autopublish=1`}
                className="rounded-lg bg-brand px-3 py-1.5 font-medium text-brand-foreground"
              >
                {t.publish.continuePublish}
              </Link>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <BillingProfileBanner
          show={
            hasActivePaidSubscription &&
            billingProfileStorageAvailable &&
            !billingProfileComplete
          }
        />
        <BillingProfileCard
          initialProfile={billingProfile}
          storageAvailable={billingProfileStorageAvailable}
          defaultFullName={billingProfileDefaultFullName}
          defaultEmail={userEmail}
          onSaved={(profile) => setBillingProfileComplete(profile.complete)}
        />

        {/* Current plan + usage summary */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card/70 p-6">
            <h2 className="text-sm font-medium text-muted-foreground">{b.currentPlan}</h2>
            {(hasActiveSub || subscription?.status === 'suspended') && shownPlan ? (
              <>
                <p className="mt-2 font-display text-2xl font-bold">{shownPlan.name}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium ${
                      subscription!.period_expired
                        ? 'bg-destructive/15 text-destructive'
                        : 'bg-primary/15 text-primary'
                    }`}
                  >
                    {subscription!.period_expired
                      ? b.statusPeriodEnded
                      : statusLabel(subscription!.status)}
                  </span>
                  {subscription!.status === 'trialing' && subscription!.trial_ends_at && (
                    <span className="text-muted-foreground">
                      {b.trialEnds}: {dateFmt.format(new Date(subscription!.trial_ends_at))} (
                      {daysUntil(subscription!.trial_ends_at)} {b.trialDaysLeft})
                    </span>
                  )}
                  {subscription!.status !== 'trialing' && subscription!.current_period_end && (
                    <span className="text-muted-foreground">
                      {subscription!.period_expired ? b.periodEndedOn : b.renews}:{' '}
                      {dateFmt.format(new Date(subscription!.current_period_end))}
                    </span>
                  )}
                </div>
                {subscription!.period_expired && (
                  <p role="status" className="mt-3 text-sm text-muted-foreground">
                    {b.periodEndedNote}
                  </p>
                )}
                {needsRenewal && (
                  <div
                    id="renew"
                    role="alert"
                    className="mt-4 scroll-mt-24 rounded-xl border border-destructive/40 bg-destructive/10 p-4"
                  >
                    <p className="text-sm text-foreground">
                      {subscription!.status === 'suspended'
                        ? b.renewSuspendedBody
                        : b.renewPastDueBody}
                    </p>
                    <Button className="mt-3" onClick={handleRenew} disabled={isPending}>
                      {subscription!.status === 'suspended' ? b.renewSuspendedCta : b.renewPastDueCta}
                    </Button>
                  </div>
                )}
                {subscription!.cancel_at_period_end && (
                  <p className="mt-3 text-sm text-destructive">{b.willCancel}</p>
                )}
                {!subscription!.cancel_at_period_end && (
                  <button
                    type="button"
                    onClick={() => setShowCancel(true)}
                    className="mt-4 text-sm text-muted-foreground underline underline-offset-2 hover:text-destructive"
                  >
                    {b.cancel}
                  </button>
                )}
              </>
            ) : subscription?.status === 'incomplete' ? (
              // Payment initiated but not yet confirmed: NOT an active
              // subscription (hasActiveSub stays false, package stays
              // unactivated) but the user must see "payment pending", never
              // "no subscription" — those read as two very different states.
              <>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-medium text-primary">
                    {statusLabel(subscription.status)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{b.pendingPlanCta}</p>
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() => handleSubscribe(subscription.plan_id)}
                  disabled={isPending}
                >
                  Tekrar ödeme yap
                </Button>
              </>
            ) : (
              <>
                <p className="mt-2 font-display text-xl font-semibold">{b.noPlan}</p>
                <p className="mt-1 text-sm text-muted-foreground">{b.noPlanCta}</p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card/70 p-6">
            <h2 className="text-sm font-medium text-muted-foreground">{b.usage}</h2>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="size-4" />
                  {b.catCorporate}
                </dt>
                <dd className="font-medium">{usage.corporate}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <ShoppingBag className="size-4" />
                  {b.catEcommerce}
                </dt>
                <dd className="font-medium">{usage.ecommerce}</dd>
              </div>
            </dl>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0 text-accent" />
              <span>{b.stripeNote}</span>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <SiteCapacityCard capacity={siteCapacity} />
          <CreditSummaryCard summary={creditSummary} />
        </section>

        {/* Faturalama donemi gecisi */}
        {hasYearlyPlans && (
          <div className="mt-10 flex flex-col items-center gap-3">
            <div
              role="tablist"
              aria-label={b.catCorporate}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card/70 p-1"
            >
              {(['month', 'year'] as const).map((iv) => {
                const selected = billingInterval === iv
                return (
                  <button
                    key={iv}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setBillingInterval(iv)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {iv === 'month' ? b.monthlyTab : b.yearlyTab}
                  </button>
                )
              })}
            </div>
            {billingInterval === 'year' && (
              <span className="inline-flex items-center rounded-full border border-accent/25 bg-accent/5 px-3 py-1 text-xs font-medium text-accent">
                {b.yearlyNote}
              </span>
            )}
          </div>
        )}

        {/* Ana sayfadaki paketlerin birebir tasarımı; CTA'lar gerçek abonelik
            aksiyonlarına bağlı. */}
        <section className="mt-8">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                cycle={marketingCycle}
                currentPlanCode={highlightedPlanCode}
                renderCta={({ code }) => renderPlanCta(code)}
              />
            ))}
          </div>
        </section>

        {/* Tek seferlik ek AI işlemi paketleri */}
        <section className="mt-10" aria-labelledby="ai-topups-title">
          <h2 id="ai-topups-title" className="flex items-center gap-2 font-display text-lg font-semibold">
            <Sparkles className="size-5 text-primary" />
            Ek AI işlemi paketleri
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tek seferlik satın alınır, aboneliğe bağlı değildir ve aylık yenilenen işlemlerinize eklenir.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {CREDIT_TOPUPS.map((pack) => {
              const busy = busyPlanId === pack.id && isPending
              return (
                <div
                  key={pack.id}
                  className="flex flex-col rounded-2xl border border-border bg-card/70 p-6 transition-colors hover:border-primary/50"
                >
                  <h3 className="font-display text-xl font-bold">+{pack.credits} AI işlemi</h3>
                  <p className="mt-2 font-display text-3xl font-bold">
                    {formatMoney(pack.priceCents, pack.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    İşlem başına {formatMoney(Math.round(pack.priceCents / pack.credits), pack.currency)}, KDV dahil
                  </p>
                  <Button
                    className="mt-5 w-full"
                    disabled={busy || isPending}
                    onClick={() => handleTopUp(pack.id)}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : b.buy}
                  </Button>
                </div>
              )
            })}
          </div>
        </section>

        {/* Abonelik dışı eklentiler (tek seferlik marka kaldırma) korunur. */}
        {addonPlans.length > 0 && (
          <section className="mt-10">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Sparkles className="size-5 text-primary" />
              {b.catAddon}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {addonPlans.map((p) => {
                const busy = busyPlanId === p.id && (isPending || previewing)
                return (
                  <div
                    key={p.id}
                    className="relative flex flex-col rounded-2xl border border-border bg-card/70 p-6 transition-colors hover:border-primary/50"
                  >
                    <h3 className="font-display text-xl font-bold">{p.name}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="font-display text-3xl font-bold">
                        {formatMoney(p.price_cents, p.currency)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {intervalLabel(p)}
                      </span>
                    </div>
                    {p.description && (
                      <p className="mt-3 text-sm text-muted-foreground">{p.description}</p>
                    )}
                    <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-accent" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6">
                      {projects.length === 0 ? (
                        <Button variant="outline" className="w-full" disabled>
                          {b.noSites}
                        </Button>
                      ) : eligibleProjects.length === 0 ? (
                        <Button variant="outline" className="w-full" disabled>
                          {b.owned}
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          disabled={busy}
                          onClick={() => openSitePicker(p)}
                        >
                          {busy ? <Loader2 className="size-4 animate-spin" /> : b.buy}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Permanent entitlements (readiness / coming soon) */}
        <section className="mt-10">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Sparkles className="size-5 text-primary" />
            {b.entitlements}
          </h2>
          {/* Rights bought once for a single site (e.g. Copyright Kaldırma). */}
          {projectEntitlements.length > 0 ? (
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/70">
              {projectEntitlements.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <BadgeCheck className="size-4 shrink-0 text-accent" />
                      <span className="truncate">{e.projectName}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {e.code === BRANDING_REMOVAL_CODE ? b.brandingRightHint : e.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="inline-flex items-center rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
                      {e.code === BRANDING_REMOVAL_CODE ? b.brandingRight : b.entitlementActive}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatMoney(e.amount_cents, e.currency)} · {b.oneTime}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/40 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{b.noPermanentRights}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{b.entitlementHint}</p>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  {entitlements.some((e) => e.status === 'active')
                    ? b.entitlementActive
                    : b.comingSoon}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Transaction history */}
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold">{b.transactions}</h2>
          {transactions.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-border bg-card/40 px-6 py-8 text-center text-sm text-muted-foreground">
              {b.noTransactions}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/70">
              {transactions.map((txn) => (
                <li key={txn.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium">{txnKindLabel(txn.kind)}</p>
                    {txn.description && (
                      <p className="text-xs text-muted-foreground">{txn.description}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {dateFmt.format(new Date(txn.created_at))}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`font-mono text-sm font-medium ${
                        txn.amount_cents < 0 ? 'text-accent' : 'text-foreground'
                      }`}
                    >
                      {formatSignedMoney(txn.amount_cents, txn.currency)}
                    </span>
                    {txn.status !== 'succeeded' && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          txn.status === 'failed'
                            ? 'bg-destructive/15 text-destructive'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {txn.status === 'failed'
                          ? b.txnStatusFailed
                          : b.txnStatusPending}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* "Which site?" dialog for the one-time per-site right */}
      {sitePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold">{b.pickSiteTitle}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{b.pickSiteDesc}</p>
              </div>
              <button
                type="button"
                onClick={() => setSitePicker(null)}
                aria-label={b.keepPlan}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <fieldset className="mt-5">
              <legend className="sr-only">{b.pickSitePlaceholder}</legend>
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {eligibleProjects.map((p) => (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                      pickedProjectId === p.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="branding-project"
                      value={p.id}
                      checked={pickedProjectId === p.id}
                      onChange={() => setPickedProjectId(p.id)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.published && p.slug ? tenantHost(p.slug) : b.draftSite}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-sm">
              <span className="text-muted-foreground">{sitePicker.name}</span>
              <span className="font-mono text-base font-bold">
                {formatMoney(sitePicker.price_cents, sitePicker.currency)}
              </span>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setSitePicker(null)} disabled={isPending}>
                {b.keepPlan}
              </Button>
              <Button
                onClick={confirmSitePurchase}
                disabled={isPending || !pickedProjectId}
                className="gap-2"
              >
                {isPending && <Loader2 className="size-4 animate-spin" />}
                {b.confirmPurchase}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Proration preview dialog */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">{b.previewTitle}</h2>
              <button
                type="button"
                onClick={() => {
                  setPreview(null)
                  setBusyPlanId(null)
                }}
                aria-label={b.keepPlan}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {preview.currentPlanName} → {preview.newPlanName}
              <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                {preview.isUpgrade ? b.upgrade : b.downgrade}
              </span>
            </p>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              {preview.creditCents > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{b.previewCredit}</dt>
                  <dd className="font-mono text-accent">
                    {formatSignedMoney(-preview.creditCents, preview.currency)}
                  </dd>
                </div>
              )}
              {preview.debitCents > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{b.previewDebit}</dt>
                  <dd className="font-mono">
                    {formatSignedMoney(preview.debitCents, preview.currency)}
                  </dd>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
                <dt className="font-medium">
                  {preview.netCents >= 0 ? b.previewNet : b.previewNetCredit}
                </dt>
                <dd className="font-mono text-base font-bold">
                  {formatMoney(Math.abs(preview.netCents), preview.currency)}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setPreview(null)
                  setBusyPlanId(null)
                }}
                disabled={isPending}
              >
                {b.keepPlan}
              </Button>
              <Button onClick={confirmChange} disabled={isPending} className="gap-2">
                {isPending && <Loader2 className="size-4 animate-spin" />}
                {b.confirmChange}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel dialog */}
      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold">{b.cancelTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{b.cancelDesc}</p>
            <div className="mt-6 flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => handleCancel(false)}
                disabled={isPending}
                className="w-full"
              >
                {b.cancelAtPeriodEnd}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleCancel(true)}
                disabled={isPending}
                className="w-full gap-2"
              >
                {isPending && <Loader2 className="size-4 animate-spin" />}
                {b.cancelNow}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowCancel(false)}
                disabled={isPending}
                className="w-full"
              >
                {b.keepPlan}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-purchase legal gate: buyer info + contracts + required consents. */}
      <CheckoutConfirmDialog
  open={checkout != null}
  item={checkout}
  defaultEmail={userEmail}
  pending={isPending}
  paymentResult={paymentResult}
  onConfirm={(buyer, paymentWindow) => checkoutRun?.(buyer, paymentWindow)}
  onRetry={() => {
    setPaymentResult(null)
    setPaymentUrl(null)
  }}
        onClose={() => {
  if (isPending) return
  setCheckout(null)
  setPaymentUrl(null)
  setCheckoutRun(null)
  setBusyPlanId(null)
        }}
      />
    </div>
  )
}

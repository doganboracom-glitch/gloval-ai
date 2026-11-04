import { BillingClient } from '@/components/billing/billing-client'
import { PLANS } from '@/lib/pricing-config'
import type { PlanRow, SubscriptionRow } from '@/lib/billing'

const previewPlans: PlanRow[] = PLANS.flatMap((plan, index) =>
  (['month', 'year'] as const).map((interval) => ({
    id: `preview-${plan.code}-${interval}`,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    price_cents: (interval === 'year' ? plan.yearlyPrice : plan.monthlyPrice) * 100,
    currency: 'TRY',
    interval,
    trial_days: 0,
    features: [],
    provider_price_id: null,
    product_category: plan.code === 'ecommerce' ? 'ecommerce' : 'corporate',
    active: true,
    sort_order: index * 2 + (interval === 'year' ? 1 : 0),
  })),
)

const currentPlan = previewPlans.find(
  (plan) => plan.code === 'starter' && plan.interval === 'month',
)!

const previewSubscription: SubscriptionRow = {
  id: 'billing-layout-preview',
  user_id: 'billing-layout-preview',
  plan_id: currentPlan.id,
  status: 'active',
  provider: 'iyzico',
  provider_ref: null,
  current_period_start: '2026-11-01T00:00:00.000Z',
  current_period_end: '2026-12-01T00:00:00.000Z',
  trial_ends_at: null,
  cancel_at_period_end: false,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  pending_plan_id: null,
  pending_change_ref: null,
  period_expired: false,
}

export default function BillingLayoutPreviewPage() {
  return (
    <BillingClient
      plans={previewPlans}
      subscription={previewSubscription}
      currentPlan={currentPlan}
      transactions={[]}
      entitlements={[]}
      projectEntitlements={[]}
      projects={[]}
      usage={{ corporate: 1, ecommerce: 0 }}
      creditSummary={{
        planCode: 'starter',
        balance: 150,
        grantedThisPeriod: 150,
        usedThisPeriod: 0,
        periodAllowance: 150,
        firstPeriodAllowance: null,
        rollover: false,
        maxBalance: null,
        periodStart: '2026-11-01T00:00:00.000Z',
        nextRenewal: '2026-12-01T00:00:00.000Z',
      }}
      userEmail="preview@example.com"
      billingProfile={null}
      billingProfileStorageAvailable={false}
      billingProfileDefaultFullName="Preview User"
    />
  )
}

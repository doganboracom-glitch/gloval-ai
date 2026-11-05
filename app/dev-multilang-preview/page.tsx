import { BillingClient, type BillingProject } from '@/components/billing/billing-client'
import { buildCreditSummary } from '@/lib/billing-summary'
import type { PlanRow } from '@/lib/billing'
import type { ProjectEntitlementItem } from '@/lib/project-entitlements'

const plan: PlanRow = {
  id: 'multilang-preview-plan',
  code: 'multilang',
  name: 'Dil Eklentisi',
  description: null,
  price_cents: 100000,
  currency: 'TRY',
  interval: 'once',
  trial_days: 0,
  features: [],
  provider_price_id: null,
  product_category: 'addon',
  active: true,
  sort_order: 99,
}

const projects: BillingProject[] = [
  {
    id: 'multilang-preview-site',
    name: 'Örnek site',
    slug: 'ornek-site',
    published: true,
  },
]

const projectEntitlements: ProjectEntitlementItem[] = [
  {
    id: 'multilang-preview-entitlement',
    project_id: 'multilang-preview-site',
    code: 'multilang',
    name: 'Dil Eklentisi',
    status: 'active',
    amount_cents: 100000,
    currency: 'TRY',
    granted_at: '2026-11-05T00:00:00.000Z',
    projectName: 'Örnek site',
    projectSlug: 'ornek-site',
  },
]

const creditSummary = buildCreditSummary({
  planCode: 'free',
  ledger: [],
  periodStart: null,
  periodEnd: null,
})

export default function MultilangBillingPreviewPage() {
  return (
    <BillingClient
      plans={[plan]}
      subscription={null}
      currentPlan={null}
      transactions={[]}
      entitlements={[]}
      projectEntitlements={projectEntitlements}
      projects={projects}
      usage={{ corporate: 1, ecommerce: 0 }}
      creditSummary={creditSummary}
      userEmail="preview@example.test"
      billingProfile={null}
      billingProfileStorageAvailable={false}
      billingProfileDefaultFullName="Preview User"
    />
  )
}

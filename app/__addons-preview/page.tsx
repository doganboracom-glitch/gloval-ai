import { BillingClient } from '@/components/billing/billing-client'
import { buildAddOnOverview, resolveAddOnPrices } from '@/lib/add-ons'
import { buildCreditSummary, buildSiteCapacity } from '@/lib/billing-summary'
import type { PlanRow } from '@/lib/billing'

const currentPlan: PlanRow = {
  id: 'preview-current',
  code: 'ecommerce',
  name: 'E-Ticaret',
  description: null,
  price_cents: 199900,
  currency: 'TRY',
  interval: 'year',
  trial_days: 0,
  features: [],
  provider_price_id: null,
  product_category: 'ecommerce',
  active: true,
  sort_order: 0,
}

const projectRightPlans: PlanRow[] = [
  {
    id: 'preview-branding',
    code: 'branding_removal',
    name: 'Copyright Kaldırma',
    description: 'Gloval AI imzasını bu siteden kaldırın.',
    price_cents: 100000,
    currency: 'TRY',
    interval: 'once',
    trial_days: 0,
    features: ['Tek site için geçerli'],
    provider_price_id: null,
    product_category: 'addon',
    active: true,
    sort_order: 10,
  },
  {
    id: 'preview-aura',
    code: 'aura_cursor',
    name: 'Aura İmleç',
    description: 'Siteniz için özel imleç efektleri.',
    price_cents: 49000,
    currency: 'TRY',
    interval: 'once',
    trial_days: 0,
    features: ['Tek site için geçerli'],
    provider_price_id: null,
    product_category: 'addon',
    active: true,
    sort_order: 20,
  },
  {
    id: 'preview-multilang',
    code: 'multilang',
    name: 'Çoklu Dil',
    description: 'Sitenize ek diller ekleyin.',
    price_cents: 99000,
    currency: 'TRY',
    interval: 'once',
    trial_days: 0,
    features: ['Tek site için geçerli'],
    provider_price_id: null,
    product_category: 'addon',
    active: true,
    sort_order: 30,
  },
]

const addOns = buildAddOnOverview({
  planCode: 'ecommerce',
  grants: [],
  prices: resolveAddOnPrices([]),
})
const projects = [
  { id: 'preview-project', name: 'Dijital Ajans', slug: 'dijital-ajans', published: true },
]
const siteCapacity = buildSiteCapacity({
  total: addOns.site.total,
  ecommerceLimit: addOns.ecommerceSiteLimit ?? 0,
  projects: [{ published: true, project_type: 'corporate' }],
})
const creditSummary = buildCreditSummary({
  planCode: 'ecommerce',
  ledger: [],
  periodStart: null,
  periodEnd: null,
  interval: 'year',
})

export default function BillingAddOnsPreviewPage() {
  return (
    <main className="mx-auto min-h-svh w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <BillingClient
        plans={[currentPlan, ...projectRightPlans]}
        subscription={null}
        currentPlan={currentPlan}
        transactions={[]}
        invoicesByTransaction={{}}
        invoiceNotRequiredIds={[]}
        invoicesAvailable={false}
        entitlements={[]}
        projectEntitlements={[]}
        projects={projects}
        usage={{ corporate: 1, ecommerce: 0 }}
        addOns={addOns}
        siteCapacity={siteCapacity}
        creditSummary={creditSummary}
        userEmail="preview@example.com"
        billingProfile={null}
        billingProfileStorageAvailable
        billingProfileDefaultFullName="Önizleme Kullanıcısı"
        hasActivePaidSubscription={false}
        addOnOutcome={null}
      />
    </main>
  )
}

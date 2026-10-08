import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listProjects } from '@/lib/projects'
import {
  getPlans,
  getMySubscription,
  getMyCurrentPlan,
  getMyTransactions,
  getMyEntitlements,
} from '@/lib/billing'
import { getMyProjectEntitlements } from '@/lib/project-entitlements'
import { getAddOnOverview } from '@/lib/effective-limits'
import { getCreditLedger } from '@/lib/ai-credits'
import { buildCreditSummary, buildSiteCapacity } from '@/lib/billing-summary'
import { BillingClient } from '@/components/billing/billing-client'
import { CreditNoticeToast } from '@/components/credit-notice-toast'

// Per-user, auth-gated billing state must always render fresh so a plan change
// made moments earlier is never served from a stale cache.
export const dynamic = 'force-dynamic'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ publish?: string; topup?: string }>
}) {
  const { publish, topup } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/billing')

  // Each read below hits Supabase independently (several re-verify the session
  // with their own auth.getUser() round trip). A single transient network blip
  // must not take down the whole billing page, so every read is isolated and
  // falls back to a safe default instead of failing the page via Promise.all.
  const [
    plansResult,
    subscriptionResult,
    currentPlanResult,
    transactionsResult,
    entitlementsResult,
    projectEntitlementsResult,
    projectsResult,
  ] = await Promise.allSettled([
    getPlans(),
    getMySubscription(),
    getMyCurrentPlan(),
    getMyTransactions(),
    getMyEntitlements(),
    getMyProjectEntitlements(),
    listProjects(),
  ])

  function unwrap<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
    if (result.status === 'fulfilled') return result.value
    console.error(`[billing] ${label} unavailable`, result.reason)
    return fallback
  }

  const plans = unwrap(plansResult, [], 'plans')
  const subscription = unwrap(subscriptionResult, null, 'subscription')
  const currentPlan = unwrap(currentPlanResult, null, 'current plan')
  const transactions = unwrap(transactionsResult, [], 'transactions')
  const entitlements = unwrap(entitlementsResult, [], 'entitlements')
  const projectEntitlements = unwrap(projectEntitlementsResult, [], 'project entitlements')
  const projects = unwrap(projectsResult, [], 'project list')

  const addOns = await getAddOnOverview(user.id, currentPlan?.code).catch((err) => {
    console.error('[billing] add-on overview unavailable', err)
    return null
  })

  const usage = {
    corporate: projects.filter((p) => p.project_type !== 'ecommerce').length,
    ecommerce: projects.filter((p) => p.project_type === 'ecommerce').length,
  }

  const siteCapacity = addOns
    ? buildSiteCapacity({
        total: addOns.site.total,
        ecommerceLimit: addOns.ecommerceSiteLimit,
        projects,
      })
    : null

  const ledger = await getCreditLedger(user.id)
  const creditSummary = buildCreditSummary({
    planCode: currentPlan?.code,
    ledger,
    periodStart: subscription?.current_period_start ?? null,
    periodEnd: subscription?.current_period_end ?? null,
    interval: currentPlan?.interval ?? null,
  })

  return (
    <>
    <CreditNoticeToast />
    <BillingClient
      plans={plans}
      subscription={subscription}
      currentPlan={currentPlan}
      transactions={transactions}
      entitlements={entitlements}
      projectEntitlements={projectEntitlements}
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        published: p.published,
      }))}
      usage={usage}
      addOns={addOns}
      siteCapacity={siteCapacity}
      creditSummary={creditSummary}
      userEmail={user.email ?? ''}
      publishProjectId={projects.find((p) => p.id === publish)?.id ?? null}
      initialTopUpId={topup ?? null}
    />
    </>
  )
}

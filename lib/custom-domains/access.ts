import type { PlanRow, SubscriptionRow, ProductCategory } from '@/lib/billing'

/**
 * Pure, client-safe custom-domain entitlement rules.
 *
 * Reuses the billing rows the app already exposes; it does not introduce a
 * second plan system. Advisory in the UI (to disable a button) and
 * authoritative on the server, where `actions.ts` re-runs it before every
 * mutation.
 */

export type DomainEntitlement = {
  /** Whether a custom domain may be connected at all. */
  allowed: boolean
  maxDomains: number
  reason?: 'no_subscription' | 'plan_excluded'
}

/**
 * Same entitling states as mail and the billing UI (`trialing`, `active`,
 * `past_due`), so a customer is never told they have a plan on /billing while
 * being denied a domain here. `past_due` keeps a live domain resolving during a
 * payment retry rather than taking a company's website down mid-dunning.
 */
const ENTITLING_STATUSES = new Set(['trialing', 'active', 'past_due'])

/**
 * Per-plan-code overrides. Live `billing_plans` rows are not read here (no
 * schema access in this workstream), so nothing is hardcoded as authoritative:
 * add exact codes to pin real limits, e.g.
 *
 *   'corporate-pro': { maxDomains: 5 },
 *
 * TODO(domains): once a `max_custom_domains` column or plan feature flag exists,
 * read it from `PlanRow` and delete these defaults.
 */
const PLAN_OVERRIDES: Record<string, { maxDomains: number }> = {}

const CATEGORY_DEFAULTS: Record<ProductCategory, { maxDomains: number }> = {
  corporate: { maxDomains: 3 },
  ecommerce: { maxDomains: 3 },
  addon: { maxDomains: 1 },
}

/** Conservative floor for a plan with no category and no override. */
const FALLBACK = { maxDomains: 1 }

export function getDomainEntitlement(
  plan: PlanRow | null,
  subscription: SubscriptionRow | null,
): DomainEntitlement {
  if (!subscription || !ENTITLING_STATUSES.has(subscription.status)) {
    return { allowed: false, maxDomains: 0, reason: 'no_subscription' }
  }
  if (!plan) {
    return { allowed: false, maxDomains: 0, reason: 'plan_excluded' }
  }

  const limits =
    PLAN_OVERRIDES[plan.code] ??
    (plan.product_category ? CATEGORY_DEFAULTS[plan.product_category] : undefined) ??
    FALLBACK

  return { allowed: true, ...limits }
}

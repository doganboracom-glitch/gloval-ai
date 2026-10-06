import type { PlanRow, SubscriptionRow, ProductCategory } from '@/lib/billing'

/**
 * Pure, client-safe mail entitlement rules. Kept free of data access and of
 * server-only env reads so both the server actions and the client UI can share
 * one definition of "how many mailboxes may this plan have".
 *
 * The admin allowlist lives in `lib/mail/admin-guard.ts` instead, because it
 * reads a non-public env var and must never be bundled into client code.
 */

export type MailQuota = {
  /** Whether corporate mail may be provisioned at all. */
  allowed: boolean
  maxMailboxes: number
  quotaMbPerBox: number
  reason?: 'no_subscription' | 'plan_excluded'
}

/**
 * Subscription states that still entitle the customer to mail. This mirrors the
 * `hasActiveSub` definition already used by the billing UI (`trialing`,
 * `active`, `past_due`) so a customer is never told they have a plan on
 * /billing while being denied mail here. `past_due` keeps mail flowing during
 * a payment retry rather than cutting off a company's email mid-dunning.
 */
const ENTITLING_STATUSES = new Set(['trialing', 'active', 'past_due'])

/**
 * Per-plan-code overrides. The live `billing_plans` rows were not readable
 * while building this (no schema access), so nothing is hardcoded as required
 * here: add exact plan codes to pin specific limits, e.g.
 *
 *   'corporate-pro': { maxMailboxes: 25, quotaMbPerBox: 10240 },
 *
 * Anything absent falls through to the category defaults below, so an unknown
 * or newly added plan code degrades to a safe limit instead of crashing or
 * silently granting unlimited mail.
 */
const PLAN_OVERRIDES: Record<string, { maxMailboxes: number; quotaMbPerBox: number }> = {}

const CATEGORY_DEFAULTS: Record<ProductCategory, { maxMailboxes: number; quotaMbPerBox: number }> = {
  corporate: { maxMailboxes: 5, quotaMbPerBox: 2048 },
  ecommerce: { maxMailboxes: 10, quotaMbPerBox: 5120 },
  addon: { maxMailboxes: 1, quotaMbPerBox: 1024 },
}

/** Conservative floor for a plan with no category and no override. */
const FALLBACK = { maxMailboxes: 3, quotaMbPerBox: 1024 }

/**
 * Resolve the mail entitlement for a subscription + plan pair.
 *
 * This is advisory in the UI (to disable a button) and authoritative on the
 * server: `lib/mail.ts` re-runs it before every create so a crafted request
 * cannot exceed the plan.
 */
export function getMailQuota(
  plan: PlanRow | null,
  subscription: SubscriptionRow | null,
): MailQuota {
  if (!subscription || !ENTITLING_STATUSES.has(subscription.status)) {
    return { allowed: false, maxMailboxes: 0, quotaMbPerBox: 0, reason: 'no_subscription' }
  }
  if (!plan) {
    return { allowed: false, maxMailboxes: 0, quotaMbPerBox: 0, reason: 'plan_excluded' }
  }

  const limits =
    PLAN_OVERRIDES[plan.code] ??
    (plan.product_category ? CATEGORY_DEFAULTS[plan.product_category] : undefined) ??
    FALLBACK

  return { allowed: true, ...limits }
}

/** Human-facing megabyte formatting shared by the customer and admin views. */
export function formatMb(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
  }
  return `${mb} MB`
}

/** Percentage of a mailbox's quota in use, clamped to 0-100. */
export function usagePercent(usedMb: number, quotaMb: number): number {
  if (quotaMb <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((usedMb / quotaMb) * 100)))
}

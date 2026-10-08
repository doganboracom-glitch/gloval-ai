import { toPlanCode } from '@/lib/pricing-config'
import {
  PLAN_INCLUDED_MAILBOXES,
  planIncludesMail,
  type MailAccessSource,
  type MailAccessStatus,
} from './access-state'
import { MailError, type MailErrorCode } from './types'

/**
 * Pure mailbox-limit rules (no I/O, safe for the client bundle).
 *
 * How many mailboxes a domain may hold =
 *   mailboxes included by the main package (FREE 0, STARTER 1, PRO 3, E-COMMERCE 5)
 *   + the capacity of every active GLOVAL Mail add-on (1 / 10 / 25 / 50 each).
 *
 * The package source and the add-on source are separate helpers so each can be
 * wired to its own data without touching the other.
 */

export type GrantEndFields = {
  /** Whether the grant's status still entitles mail (e.g. subscription trialing/active/past_due). */
  entitled: boolean
  /** End of the paid period; `null` means open-ended. */
  endsAt: Date | string | null
  /** When an un-entitled grant stopped entitling, if known. */
  endedAt?: Date | string | null
}

/** A main-package subscription as far as mail is concerned. */
export type MailPlanGrant = GrantEndFields & { code: string }

/** One active-or-lapsed GLOVAL Mail add-on purchase. `capacity` is the mailbox count it adds. */
export type MailAddonGrant = GrantEndFields & { capacity: number }

export type MailGrants = {
  plans: MailPlanGrant[]
  addons: MailAddonGrant[]
}

export type MailboxLimit = {
  /** Total mailboxes allowed on the domain. */
  max: number
  fromPlan: number
  fromAddons: number
}

/**
 * Per-mailbox size for an owner who has NO main-package quota (an add-on-only
 * owner). Same value as the existing `addon` category default in `access.ts`.
 */
export const ADDON_MAILBOX_QUOTA_MB = 1024

function toMs(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const ms = (value instanceof Date ? value : new Date(value)).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** A grant counts strictly before its end, and only while its status entitles. */
export function isGrantValid(grant: GrantEndFields, now: Date): boolean {
  if (!grant.entitled) return false
  const end = toMs(grant.endsAt)
  return end === null || end > now.getTime()
}

/**
 * Mailboxes included by the main package. One main package applies at a time,
 * so this is the best single package, never a sum. `countLapsed` also counts
 * packages that already ended (used only to show "what renewal restores").
 */
export function planMailboxAllowance(
  plans: readonly MailPlanGrant[],
  now: Date,
  countLapsed = false,
): number {
  let best = 0
  for (const plan of plans) {
    if (!countLapsed && !isGrantValid(plan, now)) continue
    best = Math.max(best, PLAN_INCLUDED_MAILBOXES[toPlanCode(plan.code)])
  }
  return best
}

/** Sum of the capacity of every GLOVAL Mail add-on that is still valid. */
export function addonMailboxAllowance(
  addons: readonly MailAddonGrant[],
  now: Date,
  countLapsed = false,
): number {
  let total = 0
  for (const addon of addons) {
    if (!countLapsed && !isGrantValid(addon, now)) continue
    if (Number.isFinite(addon.capacity) && addon.capacity > 0) total += Math.floor(addon.capacity)
  }
  return total
}

export function computeMailboxLimit(input: {
  grants: MailGrants
  now: Date
  countLapsed?: boolean
}): MailboxLimit {
  const { grants, now, countLapsed = false } = input
  const fromPlan = planMailboxAllowance(grants.plans, now, countLapsed)
  const fromAddons = addonMailboxAllowance(grants.addons, now, countLapsed)
  return { max: fromPlan + fromAddons, fromPlan, fromAddons }
}

/** The grants as the access state machine's sources. */
export function grantsToAccessSources(grants: MailGrants): MailAccessSource[] {
  const plans = grants.plans
    .filter((p) => planIncludesMail(p.code))
    .map((p): MailAccessSource => ({ kind: 'plan', entitled: p.entitled, endsAt: p.endsAt, endedAt: p.endedAt }))
  const addons = grants.addons.map(
    (a): MailAccessSource => ({ kind: 'addon', entitled: a.entitled, endsAt: a.endsAt, endedAt: a.endedAt }),
  )
  return [...plans, ...addons]
}

/** Whether the owner has (or ever had) any source of mail. Without one the page stays locked. */
export function hasAnyMailSource(grants: MailGrants): boolean {
  return grantsToAccessSources(grants).length > 0
}

export type MailboxCreationCheck =
  | { ok: true }
  | { ok: false; code: Extract<MailErrorCode, 'MAIL_ACCESS_INACTIVE' | 'MAILBOX_LIMIT_REACHED'> }

/** Decides whether ONE more mailbox may be created. Access status wins over the count. */
export function evaluateMailboxCreation(input: {
  status: MailAccessStatus
  used: number
  max: number
}): MailboxCreationCheck {
  if (input.status !== 'active') return { ok: false, code: 'MAIL_ACCESS_INACTIVE' }
  if (input.used >= input.max) return { ok: false, code: 'MAILBOX_LIMIT_REACHED' }
  return { ok: true }
}

/** How many mailboxes exceed the limit (after a downgrade or an expired add-on). Never negative. */
export function mailboxOverLimit(used: number, max: number): number {
  return Math.max(0, used - max)
}

/**
 * Size (MiB) of a new mailbox. `requestedMb` is optional: omitted means "the
 * package's size". A request above the package size, or a non-positive one, is
 * rejected rather than silently clamped. Units are MiB everywhere, matching
 * Mailcow's `quota` attribute (see `mibFromBytes` in the Mailcow adapter).
 */
export function resolveMailboxQuotaMb(requestedMb: number | undefined, maxMb: number): number {
  if (maxMb <= 0) throw new MailError('QUOTA_EXCEEDED')
  if (requestedMb === undefined) return maxMb
  if (!Number.isFinite(requestedMb) || requestedMb <= 0 || requestedMb > maxMb) {
    throw new MailError('QUOTA_EXCEEDED')
  }
  return Math.floor(requestedMb)
}

/** Package mailbox size, or the add-on default when the owner has no package quota. */
export function perBoxQuotaMb(plan: { allowed: boolean; quotaMbPerBox: number }): number {
  return plan.allowed && plan.quotaMbPerBox > 0 ? plan.quotaMbPerBox : ADDON_MAILBOX_QUOTA_MB
}

import type { BillingInterval, ProductCategory } from '@/lib/billing'
import type { SubscriptionStatus } from '@/lib/payments'
import { toPlanCode } from '@/lib/pricing-config'

/**
 * Pure, client-safe display helpers for billing. Kept out of `lib/billing.ts`
 * because that module is `'use server'` (only async server actions may be
 * exported from it). No data access here — formatting only.
 */

/** Format a minor-unit amount in its currency for display (tr-TR locale). */
export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

/** Signed money, always showing +/- (used for ledger and proration). */
export function formatSignedMoney(cents: number, currency = 'USD'): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : ''
  return `${sign}${formatMoney(Math.abs(cents), currency)}`
}

const INTERVAL_SUFFIX: Record<BillingInterval, { tr: string; en: string }> = {
  month: { tr: '/ay', en: '/mo' },
  year: { tr: '/yıl', en: '/yr' },
  once: { tr: ' tek seferlik', en: ' one-time' },
}

export function intervalSuffix(
  interval: BillingInterval,
  locale: 'tr' | 'en',
): string {
  return INTERVAL_SUFFIX[interval][locale]
}

/**
 * Plan code of the one-time, per-site "Copyright Kaldırma" right. Shared by the
 * client panel and the server action, so it lives here rather than in either of
 * the `'use server'` billing modules.
 */
export const BRANDING_REMOVAL_CODE = 'branding_removal'

/**
 * Separates the renewal ledger key from the catalog plan id a renewal moves the
 * subscription to (monthly -> yearly of the same tier). The key is written
 * server-side only; settlement re-validates the plan it names.
 */
export const RENEWAL_TARGET_MARKER = '__to_'

type SwitchablePlan = {
  id: string
  code: string
  interval: string
  active: boolean
  price_cents: number
  currency: string
  product_category?: string | null
}

/** Plan id a renewal ledger key moves the subscription to, if it names one. */
export function parseRenewalTargetPlanId(idempotencyKey: string | null | undefined): string | null {
  const key = String(idempotencyKey ?? '')
  const at = key.indexOf(RENEWAL_TARGET_MARKER)
  if (!key.startsWith('renew_') || at < 0) return null
  return key.slice(at + RENEWAL_TARGET_MARKER.length) || null
}

/**
 * True only when `target` is the active YEARLY sibling (same tier, same
 * product category, same currency, paid) of a MONTHLY `current` plan.
 */
export function isYearlySwitchTarget(current: SwitchablePlan, target: SwitchablePlan): boolean {
  return (
    target.active &&
    current.interval === 'month' &&
    target.interval === 'year' &&
    target.price_cents > 0 &&
    toPlanCode(current.code) === toPlanCode(target.code) &&
    (current.product_category ?? 'corporate') === (target.product_category ?? 'corporate') &&
    current.currency === target.currency
  )
}

export const CATEGORY_ORDER: ProductCategory[] = [
  'corporate',
  'ecommerce',
  'addon',
]

/**
 * Whether an `active` subscription's paid period has already ended. This is the
 * exact rule add-on purchase verification applies (a missing or past
 * `current_period_end` is not payable), so the billing screen and
 * `purchaseAddOn` can never disagree about whether the subscription is live.
 */
export function isActivePeriodOver(
  status: SubscriptionStatus,
  currentPeriodEnd: string | null,
  now: Date = new Date(),
): boolean {
  if (status !== 'active') return false
  if (!currentPeriodEnd) return true
  return new Date(currentPeriodEnd).getTime() <= now.getTime()
}

/** Days remaining until a timestamp (clamped at 0). */
export function daysUntil(iso: string | null): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

/**
 * Turkish, human-readable label for a subscription status — used in
 * server-side notification/email copy (which is Turkish-only by existing
 * convention, unlike the client panel's `lib/i18n.ts`-driven labels).
 * Never interpolate the raw `SubscriptionStatus` enum value into
 * user-facing text; always go through this so e.g. 'incomplete' reads as
 * "ödeme bekleniyor" instead of the internal status name.
 */
const SUBSCRIPTION_STATUS_LABEL_TR: Record<SubscriptionStatus, string> = {
  trialing: 'deneme',
  active: 'aktif',
  past_due: 'ödeme gecikti',
  suspended: 'hizmet askıya alındı',
  canceled: 'iptal edildi',
  incomplete: 'ödeme bekleniyor',
}

export function subscriptionStatusLabelTr(status: SubscriptionStatus): string {
  return SUBSCRIPTION_STATUS_LABEL_TR[status] ?? status
}

/** GLOVAL AI's billing timezone. Used for every renewal-date calculation and
 * display so a purchase near midnight always lands on the calendar day the
 * user actually paid on, regardless of the server's own timezone. */
export const BILLING_TIME_ZONE = 'Europe/Istanbul'

/** UTC offset, in minutes, of `timeZone` at the instant `date` occurred. */
function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  // formatToParts reports the wall-clock time in `timeZone`; reinterpreting
  // those same numbers as UTC and diffing against the real instant yields
  // exactly that zone's offset at this moment (DST-aware, not just a fixed +3).
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return Math.round((asUtc - date.getTime()) / 60_000)
}

/** Last valid day-of-month (1-31) for a given year/zero-indexed month. */
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * Adds whole calendar months to `date`, evaluated in the given IANA
 * `timeZone` (defaults to GLOVAL AI's billing timezone), using proper
 * "same day next month" semantics with end-of-month clamping — never a
 * fixed `30 * 24h` offset, and never plain `Date.setMonth`, whose native
 * month-overflow behavior (e.g. Aug 31 + 1 month rolls to Oct 1, and
 * Jan 31 + 1 month rolls to Mar 2/3 instead of clamping to Feb 28/29)
 * silently corrupts renewal dates for any plan billed on a day past the
 * 28th. Examples: Sep 5 -> Oct 5, Aug 31 -> Sep 30, Jan 31 (non-leap) ->
 * Feb 28, Jan 31 (leap) -> Feb 29.
 */
export function addCalendarMonths(
  date: Date,
  months: number,
  timeZone: string = BILLING_TIME_ZONE,
): Date {
  const offsetMin = timeZoneOffsetMinutes(date, timeZone)
  // Shift the instant by the zone's offset, then read it back with UTC
  // getters, so those getters yield the zone's own wall-clock date/time.
  const local = new Date(date.getTime() + offsetMin * 60_000)
  const year = local.getUTCFullYear()
  const day = local.getUTCDate()
  const hour = local.getUTCHours()
  const minute = local.getUTCMinutes()
  const second = local.getUTCSeconds()
  const ms = local.getUTCMilliseconds()

  const totalMonths = local.getUTCMonth() + months
  const targetYear = year + Math.floor(totalMonths / 12)
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12
  const targetDay = Math.min(day, lastDayOfMonth(targetYear, targetMonthIndex))

  const targetLocalMs = Date.UTC(
    targetYear,
    targetMonthIndex,
    targetDay,
    hour,
    minute,
    second,
    ms,
  )
  // Resolve the zone's offset again at the target date (handles a DST
  // change occurring between `date` and the target month; Istanbul has had
  // a fixed +03:00 offset since 2016, but this keeps the helper correct
  // for any IANA zone, not just the current one).
  const targetOffsetMin = timeZoneOffsetMinutes(
    new Date(targetLocalMs - offsetMin * 60_000),
    timeZone,
  )
  return new Date(targetLocalMs - targetOffsetMin * 60_000)
}

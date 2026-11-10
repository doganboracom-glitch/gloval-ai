/**
 * Optional "How did you hear about us?" answer, stored in the signed-in user's
 * own `profiles.heard_from`. The values mirror the CHECK constraint in
 * scripts/132-profiles-heard-from.sql; keep both lists identical.
 */
export const HEARD_FROM_VALUES = ['instagram', 'facebook', 'google', 'friend', 'press', 'other'] as const

export type HeardFromValue = (typeof HEARD_FROM_VALUES)[number]

export function isHeardFromValue(value: unknown): value is HeardFromValue {
  return typeof value === 'string' && (HEARD_FROM_VALUES as readonly string[]).includes(value)
}

/** The question is only offered to accounts created within this many days. */
export const HEARD_FROM_WINDOW_DAYS = 7

/** True for a valid account creation date that is at most HEARD_FROM_WINDOW_DAYS old. */
export function isWithinHeardFromWindow(createdAt: string | null | undefined, now = Date.now()): boolean {
  if (!createdAt) return false
  const created = Date.parse(createdAt)
  if (Number.isNaN(created)) return false
  const ageMs = now - created
  return ageMs >= 0 && ageMs <= HEARD_FROM_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

/**
 * True when the question should be offered: the account is new, and the user
 * has not answered yet. Anything unreadable (missing date, bad date) answers
 * "no" so the question can never block or nag.
 */
export function shouldAskHeardFrom(input: {
  heardFrom: string | null | undefined
  createdAt: string | null | undefined
  now?: number
}): boolean {
  if (input.heardFrom) return false
  return isWithinHeardFromWindow(input.createdAt, input.now)
}

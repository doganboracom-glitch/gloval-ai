export const DEFAULT_TRY_ON_STORE_DAILY_LIMIT = 100

/**
 * Daily cap on successful-or-in-flight try-on attempts per store, shared by
 * every visitor. Bounds the damage a distributed abuser can do to the owner's
 * credits. Override with `TRY_ON_STORE_DAILY_LIMIT`; invalid values fall back
 * to the default so a typo can never silently disable the cap.
 */
export function tryOnStoreDailyLimit(raw: string | undefined = process.env.TRY_ON_STORE_DAILY_LIMIT): number {
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TRY_ON_STORE_DAILY_LIMIT
}

export function tryOnStoreSubject(storeSlug: string): string {
  return `tryon-store:${storeSlug.toLowerCase()}`
}

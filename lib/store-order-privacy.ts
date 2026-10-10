/**
 * Pure rules for what the public order page may reveal, and to whom.
 */

/** `ayse@gmail.com` -> `a***@gmail.com`. Never returns the full local part. */
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? '').trim()
  const at = value.lastIndexOf('@')
  if (at < 1) return '***'
  return `${value[0]}***${value.slice(at)}`
}

/** Only the first given name is shown on the order page. */
export function firstNameOf(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}

export type OrderAccessInput = {
  /** Project the order belongs to. */
  orderProjectId: string | null | undefined
  /** Project resolved from the slug in the URL (null when no such store). */
  slugProjectId: string | null | undefined
  tokenValid: boolean
  /** The logged-in store customer of THIS store owns the order. */
  sessionOwnsOrder: boolean
}

/**
 * Access needs BOTH the right store AND a credential (valid token or the
 * owning customer's session). Anything else is treated as "not found" so the
 * response never reveals whether an order exists.
 */
export function canAccessOrder(input: OrderAccessInput): boolean {
  if (!input.orderProjectId || !input.slugProjectId) return false
  if (input.orderProjectId !== input.slugProjectId) return false
  return input.tokenValid || input.sessionOwnsOrder
}

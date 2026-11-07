/**
 * Deterministic Meta event IDs shared by the browser Pixel and the server-side
 * Conversions API. Meta de-duplicates a browser event and a server event only
 * when `event_name` AND `event_id` are identical, so both sides MUST build the
 * ID through these helpers. Pure module, safe on client and server.
 */

const SAFE_PART = /[^A-Za-z0-9_-]/g
const MAX_PART_LENGTH = 64

function part(value: string): string {
  return value.replace(SAFE_PART, '').slice(0, MAX_PART_LENGTH)
}

export const metaEventIds = {
  /** One per order: the payment reference the browser also receives (`gl_tx`). */
  purchase: (transactionId: string) => `purchase:${part(transactionId)}`,
  signup: (userId: string) => `signup:${part(userId)}`,
  publish: (siteId: string) => `publish:${part(siteId)}`,
  /** Per attempt: the nonce is generated in the browser and sent to both channels. */
  generate: (nonce: string) => `generate:${part(nonce)}`,
  checkout: (nonce: string) => `checkout:${part(nonce)}`,
} as const

/** Nonce format accepted by the server for per-attempt events. */
export const EVENT_NONCE_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export function newEventNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

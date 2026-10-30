/**
 * Idempotency key a browser attaches to ONE generated site. Every create path
 * for that site (landing save, publish, sign-up resume, dashboard resume) sends
 * the same token, and `projects (owner_id, client_token)` is unique while the
 * token is set, so the paths can never produce two rows for the same site.
 *
 * Kept free of server/browser APIs so both sides share one definition.
 */
export const CLIENT_TOKEN_MIN_LENGTH = 8
export const CLIENT_TOKEN_MAX_LENGTH = 128

const CLIENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

/** Returns the trimmed token, or null when absent or malformed (treated as "no token"). */
export function normalizeClientToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const token = value.trim()
  if (token.length < CLIENT_TOKEN_MIN_LENGTH || token.length > CLIENT_TOKEN_MAX_LENGTH) return null
  return CLIENT_TOKEN_PATTERN.test(token) ? token : null
}

export function newClientToken(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // fall through to the timestamp-based fallback
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}

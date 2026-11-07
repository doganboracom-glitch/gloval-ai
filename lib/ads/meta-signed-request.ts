import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type MetaSignedRequestPayload = {
  /** App-scoped Meta user id, digits only. */
  userId: string
  issuedAt: number | null
}

const MAX_SIGNED_REQUEST_LENGTH = 8192
const MAX_AGE_SECONDS = 24 * 60 * 60

/**
 * Verifies the `signed_request` Meta posts to the deauthorize and data-deletion callbacks:
 * `base64url(HMAC-SHA256(payload, app secret)).base64url(JSON payload)`.
 * Returns null for anything that cannot be authenticated (the caller must then reject the request).
 */
export function parseMetaSignedRequest(
  signedRequest: unknown,
  appSecret: string,
  now = Date.now(),
): MetaSignedRequestPayload | null {
  if (typeof signedRequest !== 'string' || !signedRequest || signedRequest.length > MAX_SIGNED_REQUEST_LENGTH) return null
  if (!appSecret) return null
  const parts = signedRequest.split('.')
  if (parts.length !== 2) return null
  const [encodedSignature, encodedPayload] = parts
  if (!encodedSignature || !encodedPayload) return null

  const supplied = Buffer.from(encodedSignature, 'base64url')
  const expected = createHmac('sha256', appSecret).update(encodedPayload).digest()
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Record<string, unknown>
    if (typeof payload.algorithm !== 'string' || payload.algorithm.toUpperCase() !== 'HMAC-SHA256') return null
    const userId = typeof payload.user_id === 'string' ? payload.user_id : typeof payload.user_id === 'number' ? String(payload.user_id) : ''
    if (!/^\d{1,30}$/.test(userId)) return null
    const issuedAt = typeof payload.issued_at === 'number' && Number.isFinite(payload.issued_at) ? payload.issued_at : null
    if (issuedAt !== null && Math.abs(now / 1000 - issuedAt) > MAX_AGE_SECONDS) return null
    return { userId, issuedAt }
  } catch {
    return null
  }
}

/** Test helper and reference implementation of the signing side. */
export function signMetaSignedRequest(payload: Record<string, unknown>, appSecret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', ...payload })).toString('base64url')
  const signature = createHmac('sha256', appSecret).update(encodedPayload).digest('base64url')
  return `${signature}.${encodedPayload}`
}

export function newMetaDeletionConfirmationCode(): string {
  return randomBytes(16).toString('hex')
}

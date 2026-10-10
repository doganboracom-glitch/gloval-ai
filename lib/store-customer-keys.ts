import { createHmac } from 'node:crypto'

/**
 * Domain-separated keys for store customer auth.
 *
 * One master secret is expanded into an independent key per purpose with
 * HMAC(master, label). A signature or hash produced for one purpose can never
 * be valid for another, even though they share the same root secret.
 *
 * Master secret, in order of preference:
 *   1. STORE_CUSTOMER_AUTH_SECRET (optional dedicated secret)
 *   2. SUPABASE_JWT_SECRET
 *   3. SUPABASE_SERVICE_ROLE_KEY
 */
export type KeyPurpose = 'session' | 'reset-token' | 'rate-limit'

function masterSecret(): string {
  const s =
    process.env.STORE_CUSTOMER_AUTH_SECRET?.trim() ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('No secret available for store customer auth.')
  return s
}

export function deriveKey(purpose: KeyPurpose): Buffer {
  return createHmac('sha256', masterSecret())
    .update(`gloval:store-customer:${purpose}:v1`)
    .digest()
}

export function hmacBase64Url(purpose: KeyPurpose, value: string): string {
  return createHmac('sha256', deriveKey(purpose)).update(value).digest('base64url')
}

export function hmacHex(purpose: KeyPurpose, value: string): string {
  return createHmac('sha256', deriveKey(purpose)).update(value).digest('hex')
}

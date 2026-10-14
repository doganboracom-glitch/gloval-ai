import 'server-only'

import { signOrderToken } from '@/lib/store-order-token'

export function tokenSecret(): string {
  return (
    process.env.STORE_ORDER_TOKEN_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  )
}

/** Signed 30-day token for one order, or '' when no secret is configured. */
export function issueOrderAccessToken(orderId: string): string {
  const secret = tokenSecret()
  return secret ? signOrderToken(orderId, secret) : ''
}

/** Path (no origin) of the order page, carrying the access token as `?t=`. */
export function buildOrderPath(storeSlug: string, orderId: string, token: string): string {
  const base = `/site/${storeSlug}/order/${orderId}`
  return token ? `${base}?t=${encodeURIComponent(token)}` : base
}

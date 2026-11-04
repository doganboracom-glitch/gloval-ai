import { createHmac } from 'node:crypto'

export function getMakerRequestHashSecret(): string | null {
  return (
    process.env.STORE_ORDER_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null
  )
}

export function hashMakerRequestValue(
  purpose: 'ip' | 'email',
  value: string,
  secret = getMakerRequestHashSecret(),
): string {
  if (!secret) throw new Error('maker_request_hash_secret_missing')

  return createHmac('sha256', secret)
    .update(`maker-requests:${purpose}:v1\0`)
    .update(value)
    .digest('hex')
}

export function hashMakerRequestIp(ip: string, secret?: string | null): string {
  return hashMakerRequestValue('ip', ip, secret ?? getMakerRequestHashSecret())
}

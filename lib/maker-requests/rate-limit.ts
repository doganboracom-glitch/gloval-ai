import { checkRateLimit, type RateLimitResult } from '@/lib/rate-limit'
import { hashMakerRequestValue } from './security'

export const MAKER_REQUEST_IP_LIMIT = 5
export const MAKER_REQUEST_IP_WINDOW_MS = 15 * 60 * 1000
export const MAKER_REQUEST_EMAIL_LIMIT = 3
export const MAKER_REQUEST_EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000

export function checkMakerRequestIpLimit(ipHash: string): RateLimitResult {
  return checkRateLimit(
    `maker-request:ip:${ipHash}`,
    MAKER_REQUEST_IP_LIMIT,
    MAKER_REQUEST_IP_WINDOW_MS,
  )
}

export function checkMakerRequestEmailLimit(email: string, secret: string): RateLimitResult {
  const emailHash = hashMakerRequestValue('email', email.trim().toLowerCase(), secret)
  return checkRateLimit(
    `maker-request:email:${emailHash}`,
    MAKER_REQUEST_EMAIL_LIMIT,
    MAKER_REQUEST_EMAIL_WINDOW_MS,
  )
}

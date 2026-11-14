import { RESEND_COOLDOWN_SECONDS } from '@/lib/signup-resend-core'

/**
 * The address a verification link was just sent to, parked in sessionStorage
 * (never in the URL) so the "check your e-mail" screen can name it and resend
 * to it. It lives only for this browser tab's session.
 */
const KEY = 'gloval:pending-verification'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export type PendingVerification = { email: string; sentAt: number }

export function storePendingVerification(email: string, sentAt = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ email, sentAt }))
  } catch {
    // Storage unavailable: the screen falls back to its address-less copy.
  }
}

export function readPendingVerification(now = Date.now()): PendingVerification | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingVerification>
    if (typeof parsed.email !== 'string' || typeof parsed.sentAt !== 'number') return null
    if (!parsed.email.includes('@') || now - parsed.sentAt > MAX_AGE_MS) return null
    return { email: parsed.email, sentAt: parsed.sentAt }
  } catch {
    return null
  }
}

export function clearPendingVerification(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

/** Whole seconds left before "Resend" unlocks; 0 once the cooldown is over. */
export function cooldownRemainingSeconds(
  sentAt: number,
  now = Date.now(),
  total = RESEND_COOLDOWN_SECONDS,
): number {
  const elapsed = Math.max(0, Math.floor((now - sentAt) / 1000))
  return Math.max(0, total - elapsed)
}

import { validateEmail } from '@/lib/email-validation'
import { sanitizeNextPath } from '@/lib/safe-redirect'
import { isSignupDraftToken } from '@/lib/signup-draft-shared'

export const RESEND_COOLDOWN_SECONDS = 60

/**
 * The one and only answer the resend endpoint ever gives. It is identical
 * whether the address is unknown, already verified, rate limited, malformed or
 * actually sent, so the endpoint cannot be used to learn which e-mails have an
 * account.
 */
export const RESEND_GENERIC_RESPONSE = { ok: true } as const
export type ResendResponse = typeof RESEND_GENERIC_RESPONSE

export type ResendRateRule = { name: string; key: string; limit: number; windowSeconds: number }

export type ResendDeps = {
  /** Resolves true when ANY of the rules is over its limit. */
  isRateLimited: (rules: ResendRateRule[]) => Promise<boolean>
  /** Asks the auth provider to send the signup verification e-mail again. */
  sendVerification: (email: string, redirectTo: string) => Promise<void>
  clientIp: string | null
  /** Absolute `/auth/callback` URL of the site the request came from. */
  callbackBase: string
}

export function buildResendRules(email: string, clientIp: string | null): ResendRateRule[] {
  return [
    // Mirrors the client's 60 s cooldown, enforced where it cannot be skipped.
    { name: 'signup-resend-email', key: email, limit: 1, windowSeconds: RESEND_COOLDOWN_SECONDS },
    { name: 'signup-resend-email-hour', key: email, limit: 5, windowSeconds: 3600 },
    { name: 'signup-resend-ip-hour', key: clientIp ?? 'unknown', limit: 20, windowSeconds: 3600 },
  ]
}

export function buildResendRedirect(callbackBase: string, next: unknown, draft: unknown): string {
  const url = new URL(callbackBase)
  url.searchParams.delete('draft')
  url.searchParams.delete('next')
  if (isSignupDraftToken(draft)) url.searchParams.set('draft', draft)
  const safeNext = sanitizeNextPath(typeof next === 'string' ? next : null)
  if (safeNext !== '/dashboard') url.searchParams.set('next', safeNext)
  return url.toString()
}

export async function resendSignupVerificationCore(
  deps: ResendDeps,
  input: { email?: unknown; next?: unknown; draft?: unknown },
): Promise<ResendResponse> {
  try {
    if (typeof input.email !== 'string') return RESEND_GENERIC_RESPONSE
    const check = validateEmail(input.email)
    if (!check.ok) return RESEND_GENERIC_RESPONSE

    if (await deps.isRateLimited(buildResendRules(check.email, deps.clientIp))) {
      return RESEND_GENERIC_RESPONSE
    }

    await deps.sendVerification(check.email, buildResendRedirect(deps.callbackBase, input.next, input.draft))
  } catch {
    // Any failure looks exactly like success to the caller.
  }
  return RESEND_GENERIC_RESPONSE
}

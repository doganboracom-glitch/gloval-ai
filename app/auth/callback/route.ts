import { createClient } from '@/lib/supabase/server'
import { scheduleWelcomeEmail } from '@/lib/email-outbox'
import { isPkceVerifierMissingError, logSupabaseAuthFailure } from '@/lib/supabase/auth-error'
import { buildVerifiedUrl } from '@/lib/auth-verified-url'
import { getSignupDraftTokenFromNextPath } from '@/lib/signup-draft-shared'
import { sanitizeNextPath } from '@/lib/safe-redirect'
import { isValidClaimToken } from '@/lib/signup-draft-core'
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function secureRedirect(url: URL): NextResponse {
  const response = NextResponse.redirect(url)
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function errorUrl(origin: string, draft: string | null): URL {
  const url = new URL('/auth/error', origin)
  if (draft) url.searchParams.set('draft', draft)
  return url
}

/**
 * The PKCE code was issued by Supabase only after the e-mail address was
 * verified, but this browser (typically a phone) never started the sign-up and
 * so lacks the code verifier. No session can be created here; the account is
 * already verified, so show the success screen and let the user sign in.
 */
function pkceVerifierMissingRedirect(origin: string, next: string, draft: string | null): NextResponse {
  console.warn('[auth callback] PKCE code verifier missing; verified in a different browser or device')
  return secureRedirect(buildVerifiedUrl(origin, next, draft))
}

/**
 * Supabase's existing callback remains compatible with PKCE `code` links and
 * token-hash links. The dedicated `/auth/confirm` route handles new templates;
 * this route is deliberately kept for confirmation emails already in inboxes.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const rawNext = searchParams.get('next')
  const next = sanitizeNextPath(rawNext)
  const isRecovery = type === 'recovery' || rawNext === '/auth/reset-password'
  const rawDraft = searchParams.get('draft')
  const draft =
    (isValidClaimToken(rawDraft) ? rawDraft : null) ?? getSignupDraftTokenFromNextPath(next)

  const supabase = await createClient()
  let verifyError: unknown = null
  let verifiedUser: { id: string; email_confirmed_at?: string | null; created_at?: string | null } | null = null

  try {
    if (tokenHash && type) {
      const result = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      verifyError = result.error
      verifiedUser = result.data?.user ?? null
    } else if (code) {
      const result = await supabase.auth.exchangeCodeForSession(code)
      verifyError = result.error
      verifiedUser = result.data?.user ?? null
    } else {
      console.warn('[auth callback] Supabase callback is missing a code or token hash')
      return secureRedirect(errorUrl(origin, draft))
    }
  } catch (error) {
    if (!isRecovery && isPkceVerifierMissingError(error)) {
      return pkceVerifierMissingRedirect(origin, next, draft)
    }
    logSupabaseAuthFailure('auth callback', error)
    return secureRedirect(errorUrl(origin, draft))
  }

  if (verifyError) {
    if (!isRecovery && isPkceVerifierMissingError(verifyError)) {
      return pkceVerifierMissingRedirect(origin, next, draft)
    }
    logSupabaseAuthFailure('auth callback', verifyError)
    return secureRedirect(errorUrl(origin, draft))
  }

  if (!isRecovery) scheduleWelcomeEmail(verifiedUser)

  const successUrl = isRecovery
    ? new URL('/auth/reset-password', origin)
    : buildVerifiedUrl(origin, next, draft)

  if (!isRecovery) {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) logSupabaseAuthFailure('auth callback sign-out', error)
    } catch (error) {
      logSupabaseAuthFailure('auth callback sign-out', error)
    }
  }

  return secureRedirect(successUrl)
}

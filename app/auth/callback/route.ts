import { createClient } from '@/lib/supabase/server'
import { logSupabaseAuthFailure } from '@/lib/supabase/auth-error'
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

  try {
    if (tokenHash && type) {
      const result = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      verifyError = result.error
    } else if (code) {
      const result = await supabase.auth.exchangeCodeForSession(code)
      verifyError = result.error
    } else {
      console.warn('[auth callback] Supabase callback is missing a code or token hash')
      return secureRedirect(errorUrl(origin, draft))
    }
  } catch (error) {
    logSupabaseAuthFailure('auth callback', error)
    return secureRedirect(errorUrl(origin, draft))
  }

  if (verifyError) {
    logSupabaseAuthFailure('auth callback', verifyError)
    return secureRedirect(errorUrl(origin, draft))
  }

  const keepSession = isRecovery || draft !== null
  const successUrl = isRecovery
    ? new URL('/auth/reset-password', origin)
    : draft
      ? new URL(`/auth/resume?draft=${encodeURIComponent(draft)}`, origin)
      : new URL(`/auth/verified?next=${encodeURIComponent(next)}`, origin)

  if (!keepSession) {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) logSupabaseAuthFailure('auth callback sign-out', error)
    } catch (error) {
      logSupabaseAuthFailure('auth callback sign-out', error)
    }
  }

  return secureRedirect(successUrl)
}

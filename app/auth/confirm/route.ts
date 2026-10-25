import { createClient } from '@/lib/supabase/server'
import { logSupabaseAuthFailure } from '@/lib/supabase/auth-error'
import { getSignupDraftTokenFromNextPath } from '@/lib/signup-draft-shared'
import { sanitizeNextPath } from '@/lib/safe-redirect'
import { isValidClaimToken } from '@/lib/signup-draft-core'
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function parseConfirmationType(value: string | null): EmailOtpType | null {
  if (value === 'signup' || value === 'email') return value
  return null
}

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

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = parseConfirmationType(searchParams.get('type'))
  const next = sanitizeNextPath(searchParams.get('next'))
  const rawDraft = searchParams.get('draft')
  const draft =
    (isValidClaimToken(rawDraft) ? rawDraft : null) ?? getSignupDraftTokenFromNextPath(next)

  if (!tokenHash || !type) {
    console.warn('[auth confirm] confirmation link is missing a supported token hash or type')
    return secureRedirect(errorUrl(origin, draft))
  }

  const supabase = await createClient()

  try {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) {
      logSupabaseAuthFailure('auth confirm', error)
      return secureRedirect(errorUrl(origin, draft))
    }
  } catch (error) {
    logSupabaseAuthFailure('auth confirm', error)
    return secureRedirect(errorUrl(origin, draft))
  }

  if (draft) {
    const resumeUrl = new URL('/auth/resume', origin)
    resumeUrl.searchParams.set('draft', draft)
    return secureRedirect(resumeUrl)
  }

  try {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) logSupabaseAuthFailure('auth confirm sign-out', signOutError)
  } catch (error) {
    logSupabaseAuthFailure('auth confirm sign-out', error)
  }

  const verifiedUrl = new URL('/auth/verified', origin)
  verifiedUrl.searchParams.set('next', next)
  return secureRedirect(verifiedUrl)
}

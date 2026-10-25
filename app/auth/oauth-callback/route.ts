import { createClient } from '@/lib/supabase/server'
import { sanitizeNextPath } from '@/lib/safe-redirect'
import { NextRequest, NextResponse } from 'next/server'

type OAuthLogError = {
  name?: unknown
  message?: unknown
  status?: unknown
  code?: unknown
}

function redactOAuthLogValue(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null

  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(access_token|refresh_token|id_token|token|authorization|client_secret|code|state|email|phone)\s*[:=]\s*[^&\s,;]+/gi, '$1=[redacted]')
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '[redacted-token]')
    .replace(/(?:\+?\d[\d .()-]*){8,}/g, '[redacted-number]')
    .slice(0, 500)
}

function logOAuthCallbackFailure(
  request: NextRequest,
  stage: 'provider_callback' | 'session_exchange',
  supabaseError?: OAuthLogError | null,
) {
  const { searchParams } = request.nextUrl

  console.error('[auth/oauth-callback] social sign-in failed', {
    stage,
    supabaseError: supabaseError
      ? {
          name: redactOAuthLogValue(supabaseError.name),
          message: redactOAuthLogValue(supabaseError.message),
          status: typeof supabaseError.status === 'number' ? supabaseError.status : null,
          code: redactOAuthLogValue(supabaseError.code),
        }
      : null,
    oauthErrorParams: {
      error: redactOAuthLogValue(searchParams.get('error')),
      error_code: redactOAuthLogValue(searchParams.get('error_code')),
      error_description: redactOAuthLogValue(searchParams.get('error_description')),
      error_uri: redactOAuthLogValue(searchParams.get('error_uri')),
    },
  })
}

/**
 * Callback for Google social sign-in.
 *
 * This is intentionally a SEPARATE route from `/auth/callback`. Both an
 * OAuth authorization and an email confirmation link resolve through the
 * same Supabase PKCE `?code=` shape, but they need different endings:
 * email confirmation must NOT leave the visitor signed in (see
 * `/auth/callback`'s comment), while a social login must. Keeping them
 * split avoids touching that existing, already-correct email flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const code = searchParams.get('code')
  const next = sanitizeNextPath(searchParams.get('next'))

  if (!code) {
    logOAuthCallbackFailure(request, 'provider_callback')
    return NextResponse.redirect(`${origin}/auth/login?error=oauth`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    logOAuthCallbackFailure(request, 'session_exchange', error)
    return NextResponse.redirect(`${origin}/auth/login?error=oauth`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}

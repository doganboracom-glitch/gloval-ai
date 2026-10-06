import { createClient } from '@/lib/supabase/server'
import { sanitizeNextPath } from '@/lib/safe-redirect'
import { NextRequest, NextResponse } from 'next/server'

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
    return NextResponse.redirect(`${origin}/auth/login?error=oauth`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/auth/login?error=oauth`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}

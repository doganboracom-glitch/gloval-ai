import { createClient } from '@/lib/supabase/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Supabase email-confirmation callback.
 *
 * Handles BOTH flows that a `{{ .ConfirmationURL }}` link can produce:
 *   - PKCE: the link redirects back with a `?code=...` that we exchange for a
 *     session.
 *   - OTP / token_hash: the link redirects back with `?token_hash=...&type=...`
 *     that we verify with `verifyOtp`.
 * The real confirmation URL is never reconstructed by hand — we only read the
 * parameters Supabase appended and let the SDK complete the flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  // Only allow internal, same-origin redirect targets to avoid open redirects.
  const rawNext = searchParams.get('next') ?? '/dashboard'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'
  const isRecovery = type === 'recovery' || rawNext === '/auth/reset-password'

  const supabase = await createClient()

  // A password-reset link goes straight to the reset-password screen (it
  // still needs the new-session cookie, but has nothing to "verify" for the
  // user). Everything else (signup confirmation, resend) is a real email
  // verification and gets the branded success screen first.
  const successRedirect = isRecovery
    ? `${origin}/auth/reset-password`
    : `${origin}/auth/verified?next=${encodeURIComponent(next)}`

  let verifyError: { message: string } | null = null
  if (tokenHash && type) {
    ;({ error: verifyError } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }))
  } else if (code) {
    ;({ error: verifyError } = await supabase.auth.exchangeCodeForSession(code))
  } else {
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  if (verifyError) {
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  // Signup confirmation only needs to prove the email is real — it should
  // not silently sign the user in. `verifyOtp`/`exchangeCodeForSession`
  // always issue a session as a side effect, so we drop it right away and
  // send the user to a real login screen. A recovery link is different: the
  // reset-password page genuinely needs that session to let the user set a
  // new password.
  if (!isRecovery) {
    await supabase.auth.signOut()
  }

  return NextResponse.redirect(successRedirect)
}

import { createClient } from '@/lib/supabase/server'
import { scheduleWelcomeEmail } from '@/lib/email-outbox'
import { logSupabaseAuthFailure } from '@/lib/supabase/auth-error'
import { getSignupDraftTokenFromNextPath } from '@/lib/signup-draft-shared'
import { buildVerifiedUrl } from '@/lib/auth-verified-url'
import { sanitizeNextPathWithDecoding } from '@/lib/safe-redirect'
import { isValidClaimToken } from '@/lib/signup-draft-core'
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function parseConfirmationType(value: FormDataEntryValue | null): EmailOtpType | null {
  if (value === 'signup' || value === 'email' || value === 'recovery') return value
  return null
}

function formString(formData: FormData, name: string): string | null {
  const value = formData.get(name)
  return typeof value === 'string' ? value : null
}

function redirect(url: URL): NextResponse {
  return NextResponse.redirect(url, 303)
}

function errorUrl(origin: string, draft: string | null, isRecovery = false): URL {
  const url = new URL('/auth/error', origin)
  if (isRecovery) url.searchParams.set('reason', 'recovery')
  else if (draft) url.searchParams.set('draft', draft)
  return url
}

export async function POST(request: NextRequest) {
  const { origin } = request.nextUrl
  let formData: FormData

  try {
    formData = await request.formData()
  } catch {
    return redirect(errorUrl(origin, null))
  }

  const rawTokenHash = formString(formData, 'token_hash')?.trim() ?? ''
  const tokenHash = rawTokenHash && rawTokenHash.length <= 512 ? rawTokenHash : null
  const type = parseConfirmationType(formData.get('type'))
  const isRecovery = type === 'recovery'
  const next = isRecovery
    ? '/auth/reset-password'
    : sanitizeNextPathWithDecoding(formString(formData, 'next'))
  const rawDraft = isRecovery ? null : formString(formData, 'draft')
  const draft = isRecovery
    ? null
    : (isValidClaimToken(rawDraft) ? rawDraft : null) ?? getSignupDraftTokenFromNextPath(next)

  if (!tokenHash || !type) {
    console.warn('[auth confirm] POST is missing a supported token hash or type')
    return redirect(errorUrl(origin, draft, isRecovery))
  }

  const supabase = await createClient()

  try {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) {
      logSupabaseAuthFailure('auth confirm', error)
      return redirect(errorUrl(origin, draft, isRecovery))
    }
    if (isRecovery) {
      return redirect(new URL('/auth/reset-password', origin))
    }
    scheduleWelcomeEmail(data?.user)
  } catch (error) {
    logSupabaseAuthFailure('auth confirm', error)
    return redirect(errorUrl(origin, draft, isRecovery))
  }

  try {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) logSupabaseAuthFailure('auth confirm sign-out', signOutError)
  } catch (error) {
    logSupabaseAuthFailure('auth confirm sign-out', error)
  }

  return redirect(buildVerifiedUrl(origin, next, draft))
}

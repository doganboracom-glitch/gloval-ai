import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_LANG, LANG_COOKIE, normalizeLang, type Lang } from '@/lib/i18n'

const BLOCK_WINDOW_MS = 15 * 60 * 1000
const GENERIC_MESSAGE = 'Bu adres kayıtlıysa, şifre yenileme bağlantısı gönderildi. Gelen kutunuzu kontrol edin.'

function getRequestContext(request: Request) {
  return {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
  }
}

function resolveEmailLocale(request: Request): Lang {
  const cookieValue = request.headers
    .get('cookie')
    ?.split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${LANG_COOKIE}=`))
    ?.slice(LANG_COOKIE.length + 1)
  let decoded: string | null = null
  try {
    decoded = cookieValue ? decodeURIComponent(cookieValue) : null
  } catch {
    decoded = null
  }
  const fromCookie = normalizeLang(decoded?.trim().toLowerCase())
  if (fromCookie) return fromCookie

  const acceptLanguage = request.headers.get('accept-language') ?? ''
  for (const part of acceptLanguage.split(',')) {
    const match = normalizeLang(part.split(';')[0]?.trim())
    if (match) return match
  }
  return DEFAULT_LANG
}

export async function POST(request: Request) {
  const context = getRequestContext(request)
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || email.length > 254) {
    return NextResponse.json({ message: GENERIC_MESSAGE })
  }

  const admin = createAdminClient()
  const { data: users, error: userError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const user = !userError ? users.users.find((candidate) => candidate.email?.toLowerCase() === email) : null

  // Do not reveal whether an address exists, even when the admin lookup fails.
  if (!user) return NextResponse.json({ message: GENERIC_MESSAGE })

  const now = new Date()
  const blockedUntil = new Date(now.getTime() + BLOCK_WINDOW_MS)
  const { data: profile } = await admin
    .from('profiles')
    .select('password_reset_blocked_until')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.password_reset_blocked_until && new Date(profile.password_reset_blocked_until) > now) {
    await admin.from('password_reset_security_events').insert({
      user_id: user.id,
      event_type: 'reset_request_rejected',
      blocked_from: now.toISOString(),
      blocked_until: new Date(profile.password_reset_blocked_until).toISOString(),
      ip_address: context.ip,
      user_agent: context.userAgent,
    })
    return NextResponse.json({ message: GENERIC_MESSAGE })
  }

  await admin
    .from('profiles')
    .update({ password_reset_blocked_until: blockedUntil.toISOString() })
    .eq('id', user.id)

  // The Supabase email template renders exactly one language block based on
  // user_metadata.email_locale, so it must be stored before the email is sent.
  const emailLocale = resolveEmailLocale(request)
  if (user.user_metadata?.email_locale !== emailLocale) {
    const { data: updated, error: localeError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, email_locale: emailLocale },
    })
    if (localeError || updated?.user?.user_metadata?.email_locale !== emailLocale) {
      // Never send the email with a stale/missing locale; release the throttle so the user can retry.
      console.error('[forgot-password] email_locale update failed:', localeError?.message ?? 'value mismatch')
      await admin.from('profiles').update({ password_reset_blocked_until: null }).eq('id', user.id)
      return NextResponse.json({ message: GENERIC_MESSAGE })
    }
  }

  const supabase = await createClient()
  const origin = new URL(request.url).origin
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  })

  if (error) {
    await admin.from('profiles').update({ password_reset_blocked_until: null }).eq('id', user.id)
    return NextResponse.json({ message: GENERIC_MESSAGE })
  }

  return NextResponse.json({ message: GENERIC_MESSAGE })
}

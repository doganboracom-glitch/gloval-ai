'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAuthCallbackUrl } from '@/lib/auth-redirect'
import { prepareReferralSignupIntent } from '@/lib/referrals/client'
import { useLanguage } from '@/components/language-provider'
import { readConsent } from '@/lib/cookie-consent-storage'
import { OAUTH_SIGNUP_FLOW_PARAM, PENDING_OAUTH_SIGNUP_COOKIE } from '@/lib/analytics-events'
import { trackFunnelEvent, VERCEL_FUNNEL_EVENTS } from '@/lib/vercel-analytics'

type Provider = 'google'

/**
 * Social sign-in buttons shared by the login and sign-up screens. OAuth does
 * not distinguish "log in" from "sign up" — Supabase creates the account on
 * first authorization — so both modes use the same provider flow. Signup mode
 * adds a short-lived, consented marker for attribution after the callback.
 */
export function OAuthButtons({ mode, next }: { mode: 'login' | 'signup'; next?: string }) {
  const { t } = useLanguage()
  const [pending, setPending] = useState<Provider | null>(null)
  const disabled = pending !== null

  async function handleClick(provider: Provider) {
    setPending(provider)
    if (mode === 'signup') {
      trackFunnelEvent(VERCEL_FUNNEL_EVENTS.signupSubmit, { method: provider })
      try {
        if (readConsent()?.analytics === true) {
          const secure = window.location.protocol === 'https:' ? '; secure' : ''
          document.cookie = `${PENDING_OAUTH_SIGNUP_COOKIE}=${Date.now()}; path=/; max-age=600; samesite=lax${secure}`
        }
      } catch {
        // A tracking-cookie failure must not block OAuth.
      }
    }
    await prepareReferralSignupIntent(mode === 'signup' ? 'oauth' : 'login')
    const supabase = createClient()
    const redirectUrl = new URL(getAuthCallbackUrl('/auth/oauth-callback'))
    if (next) redirectUrl.searchParams.set('next', next)
    if (mode === 'signup') redirectUrl.searchParams.set(OAUTH_SIGNUP_FLOW_PARAM, '1')
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectUrl.toString() },
    })
    // On success the browser is already being navigated away to the
    // provider's consent screen, so there is nothing else to do here. Only
    // an immediate, local failure (e.g. provider not enabled) reaches this.
    if (error) {
      setPending(null)
      try {
        document.cookie = `${PENDING_OAUTH_SIGNUP_COOKIE}=; path=/; max-age=0; samesite=lax`
      } catch {
        // A tracking-cookie failure must not hide the OAuth error.
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => handleClick('google')}
        disabled={disabled}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-lg bg-brand text-sm font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-white">
          {pending === 'google' ? (
            <Loader2 className="size-4 animate-spin text-neutral-700" />
          ) : (
            <Image src="/icons/google.svg" alt="" width={18} height={18} aria-hidden />
          )}
        </span>
        {mode === 'login' ? t.auth.continueWithGoogle : t.auth.signupWithGoogle}
      </button>
      <p className="text-center text-xs text-muted-foreground">{t.auth.googleNoVerification}</p>
    </div>
  )
}

export function OAuthDivider() {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-3 text-xs font-medium uppercase text-muted-foreground">
      <span className="h-px flex-1 bg-border" aria-hidden />
      {t.auth.orDivider}
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  )
}

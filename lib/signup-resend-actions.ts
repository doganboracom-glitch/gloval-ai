'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { clientIpFromHeaders } from '@/lib/ads/client-ip'
import { anyRateLimited } from '@/lib/store-auth-rate-limit'
import {
  resendSignupVerificationCore,
  type ResendResponse,
} from '@/lib/signup-resend-core'

function resolveCallbackBase(h: Pick<Headers, 'get'>): string {
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const isLocalHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  const devOverride = process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL?.trim()
  if (isLocalHost && devOverride) return devOverride
  const proto = h.get('x-forwarded-proto') ?? (isLocalHost ? 'http' : 'https')
  return `${proto}://${host}/auth/callback`
}

/**
 * Sends the signup verification e-mail again. Always answers `{ ok: true }`
 * (see `RESEND_GENERIC_RESPONSE`), so it never reveals whether an address is
 * registered; abuse is limited per e-mail and per IP on the server.
 */
export async function resendSignupVerification(input: {
  email: string
  next?: string
  draft?: string
}): Promise<ResendResponse> {
  const h = await headers()
  return resendSignupVerificationCore(
    {
      clientIp: clientIpFromHeaders(h),
      callbackBase: resolveCallbackBase(h),
      isRateLimited: anyRateLimited,
      sendVerification: async (email, redirectTo) => {
        const supabase = await createClient()
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: redirectTo },
        })
        if (error) console.log('[v0] signup resend failed:', error.status ?? error.code ?? 'unknown')
      },
    },
    input,
  )
}

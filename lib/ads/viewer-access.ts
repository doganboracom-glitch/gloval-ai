import 'server-only'

import { resolveGoogleAdsAccess } from '@/lib/ads/env'
import { ADS_ANONYMOUS_VIEWER, type AdsPlatformGate, type AdsViewerAccess } from '@/lib/ads/platforms'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { createClient } from '@/lib/supabase/server'
import { getPageAuthState } from '@/lib/supabase/page-auth'

export type AdsUserIdentity = {
  id: string
  email?: string | null
  email_confirmed_at?: string | null
}

export function openGatesForUser(user: AdsUserIdentity): AdsPlatformGate[] {
  const access = resolveGoogleAdsAccess(user.id, {
    emailConfirmed: Boolean(user.email_confirmed_at),
    isAdmin: isAdminEmail(user.email),
  })
  return access.canConnect ? ['google_connect'] : []
}

/** Resolved on the server; never trusts the client for gate decisions. */
export async function resolveAdsViewerAccess(): Promise<AdsViewerAccess> {
  try {
    const supabase = await createClient()
    const authState = await getPageAuthState(supabase)
    if (authState.kind !== 'authenticated') return ADS_ANONYMOUS_VIEWER
    return { authenticated: true, openGates: openGatesForUser(authState.user) }
  } catch {
    return ADS_ANONYMOUS_VIEWER
  }
}

import 'server-only'

import { resolveGoogleAdsAccess, resolveMetaAdsAccess } from '@/lib/ads/env'
import { isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'
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
  const identity = {
    emailConfirmed: Boolean(user.email_confirmed_at),
    isAdmin: isAdminEmail(user.email),
  }
  const gates: AdsPlatformGate[] = []
  if (resolveGoogleAdsAccess(user.id, identity).canConnect) gates.push('google_connect')
  if (isAdsFeatureUiEnabled() && resolveMetaAdsAccess(user.id, identity).canConnect) gates.push('meta_connect')
  return gates
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

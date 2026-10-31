import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isGoogleAdsConnectAllowed, resolveGoogleAdsConnectEnabled } from '@/lib/ads/google-ads-gate'

type GoogleAdsRouteAccess =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

export async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return null
    return data.user.id
  } catch {
    return null
  }
}

export async function requireGoogleAdsConnectUser(): Promise<GoogleAdsRouteAccess> {
  if (!resolveGoogleAdsConnectEnabled()) {
    return { ok: false, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  }

  if (!isGoogleAdsConnectAllowed(userId)) {
    return { ok: false, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  }

  return { ok: true, userId }
}

import 'server-only'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleAdsError, googleAdsErrorCode, googleAdsHttpStatus } from '@/lib/ads/google-ads-error'
import { isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Vary: 'Cookie',
}

export function googleAdsFeatureEnabled(): boolean {
  return isAdsFeatureUiEnabled()
}

export async function googleAdsUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

export function isSameOriginGoogleAdsPost(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false

  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export function googleAdsJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

export function googleAdsErrorResponse(error: unknown): NextResponse {
  const code = googleAdsErrorCode(error)
  return googleAdsJson({ ok: false, error: code }, googleAdsHttpStatus(code))
}

export function googleAdsNotFound(): NextResponse {
  return googleAdsJson({ ok: false, error: 'not_found' }, 404)
}

export function googleAdsRedirect(request: Request, values: Record<string, string>): NextResponse {
  const url = new URL('/ads/dashboard', request.url)
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value)
  const response = NextResponse.redirect(url, 303)
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) response.headers.set(key, value)
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

export function assertGoogleAdsFeature(): void {
  if (!googleAdsFeatureEnabled()) throw new GoogleAdsError('configuration_missing')
}

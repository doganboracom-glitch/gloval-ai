import { NextResponse } from 'next/server'
import { resolveMetaAdsAppSettings } from '@/lib/ads/env'
import { revokeMetaConnectionsForMetaUser } from '@/lib/ads/meta-connections'
import { parseMetaSignedRequest } from '@/lib/ads/meta-signed-request'

export const dynamic = 'force-dynamic'

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Meta "Deauthorize callback": posted (form-encoded `signed_request`) when a user removes the app.
 * Not gated by the access mode on purpose: a revoke must always be honoured. Unauthenticated requests are rejected.
 */
export async function POST(request: Request) {
  const resolved = resolveMetaAdsAppSettings()
  if (!resolved.ok) return json({ error: 'configuration_missing' }, 503)

  let signedRequest: unknown = null
  try {
    signedRequest = (await request.formData()).get('signed_request')
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  const payload = parseMetaSignedRequest(signedRequest, resolved.settings.appSecret)
  if (!payload) return json({ error: 'signature_invalid' }, 403)

  try {
    await revokeMetaConnectionsForMetaUser(payload.userId, null)
  } catch {
    console.error('[meta-ads] deauthorize revoke failed')
    return json({ error: 'provider_error' }, 503)
  }
  return json({ ok: true }, 200)
}

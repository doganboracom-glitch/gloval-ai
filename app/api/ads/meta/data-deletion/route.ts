import { NextResponse } from 'next/server'
import { resolveMetaAdsAppSettings } from '@/lib/ads/env'
import { revokeMetaConnectionsForMetaUser } from '@/lib/ads/meta-connections'
import { newMetaDeletionConfirmationCode, parseMetaSignedRequest } from '@/lib/ads/meta-signed-request'

export const dynamic = 'force-dynamic'

export const META_DATA_DELETION_STATUS_URL = 'https://gloval.ai/yasal/veri-silme'

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * Meta "Data Deletion Request" callback. Responds with the JSON Meta requires:
 * `{ url, confirmation_code }`. Unauthenticated (bad signature) requests are rejected.
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

  const confirmationCode = newMetaDeletionConfirmationCode()
  try {
    await revokeMetaConnectionsForMetaUser(payload.userId, confirmationCode)
  } catch {
    console.error('[meta-ads] data deletion revoke failed')
    return json({ error: 'provider_error' }, 503)
  }

  return json(
    { url: `${META_DATA_DELETION_STATUS_URL}?code=${confirmationCode}`, confirmation_code: confirmationCode },
    200,
  )
}

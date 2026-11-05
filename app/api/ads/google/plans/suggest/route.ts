import { googleAdsJson } from '@/lib/ads/google-route-utils'
import { publishGateResponse, requireGoogleAdsPublishRequest } from '@/lib/ads/google-publish-route'
import { loadDraftConnection, readJsonBody, suggestBodySchema, suggestForConnection } from '@/lib/ads/google-plan-draft'

export const dynamic = 'force-dynamic'

/** Validates a scan result against Google Ads rules and the server budget ceiling. Writes nothing. */
export async function POST(request: Request) {
  const gate = await requireGoogleAdsPublishRequest(request)
  if (publishGateResponse(gate)) return gate.response

  const body = suggestBodySchema.safeParse(await readJsonBody(request))
  if (!body.success) return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)

  const connection = await loadDraftConnection(gate.userId, body.data.connectionId)
  if (!connection.ok) return googleAdsJson({ ok: false, error: connection.error }, connection.status)

  const outcome = suggestForConnection(body.data.result, connection.connection)
  if (!outcome.ok) return googleAdsJson({ ok: false, error: outcome.error }, outcome.status)
  return googleAdsJson({ ok: true, suggestion: outcome.suggestion })
}

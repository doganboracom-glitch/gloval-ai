import { googleAdsJson } from '@/lib/ads/google-route-utils'
import { publishGateResponse, requireGoogleAdsPublishRequest } from '@/lib/ads/google-publish-route'
import {
  createDraftFromSuggestion,
  loadDraftConnection,
  readJsonBody,
  suggestBodySchema,
  suggestForConnection,
} from '@/lib/ads/google-plan-draft'

export const dynamic = 'force-dynamic'

/**
 * Hand-off from the public /ads preview: turns the scan result the visitor
 * already has into a draft plan, without scanning again or charging credits.
 * It only writes a draft; nothing is sent to Google Ads.
 */
export async function POST(request: Request) {
  const gate = await requireGoogleAdsPublishRequest(request)
  if (publishGateResponse(gate)) return gate.response

  const body = suggestBodySchema.safeParse(await readJsonBody(request))
  if (!body.success) return googleAdsJson({ ok: false, error: 'invalid_request' }, 400)

  const connection = await loadDraftConnection(gate.userId, body.data.connectionId)
  if (!connection.ok) return googleAdsJson({ ok: false, error: connection.error }, connection.status)

  const outcome = suggestForConnection(body.data.result, connection.connection)
  if (!outcome.ok) return googleAdsJson({ ok: false, error: outcome.error }, outcome.status)

  const created = await createDraftFromSuggestion(gate.userId, connection.connection, outcome.suggestion)
  if (!created.ok) return googleAdsJson({ ok: false, error: created.error }, created.status)
  return googleAdsJson({ ok: true, planId: created.planId, version: created.version }, 201)
}

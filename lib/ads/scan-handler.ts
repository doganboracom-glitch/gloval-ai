import { z } from 'zod'
import { ADS_ANON_COOKIE, verifyAnonCookie } from '@/lib/ads/anon-identity'
import { clientIpFromHeaders } from '@/lib/ads/client-ip'
import { ADS_SCAN_ERROR_STATUS, adsScanErrorBody, type AdsScanError } from '@/lib/ads/public-errors'
import { runScan, type ScanActor, type ScanDeps } from '@/lib/ads/scan-orchestrator'

const MAX_BODY_BYTES = 2048

const bodySchema = z.object({
  address: z.string().trim().min(1).max(300),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
})

export type ScanHandlerEnv = {
  featureEnabled: boolean
  /** Signed-in user, or null for a visitor. */
  getUser: () => Promise<{ userId: string; planCode: string | null } | null>
  getCookie: (name: string) => string | undefined
  deps: ScanDeps
}

function errorResponse(error: AdsScanError): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' })
  if (error.retryAfterSeconds) headers.set('Retry-After', String(error.retryAfterSeconds))
  return Response.json(adsScanErrorBody(error), { status: ADS_SCAN_ERROR_STATUS[error.code], headers })
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** The request half of `POST /api/ads/scan`: identity, body validation, then the orchestrator. */
export async function handleScanRequest(request: Request, env: ScanHandlerEnv): Promise<Response> {
  if (!env.featureEnabled) return Response.json({ error: { code: 'service_unavailable' } }, { status: 404 })
  if (!sameOrigin(request)) return errorResponse({ code: 'invalid_request' })

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return errorResponse({ code: 'invalid_request' })
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return errorResponse({ code: 'invalid_request' })
  }
  const body = bodySchema.safeParse(json)
  if (!body.success) return errorResponse({ code: 'invalid_request' })

  const ip = clientIpFromHeaders(request.headers)
  if (!ip) return errorResponse({ code: 'service_unavailable' })

  let actor: ScanActor
  const user = await env.getUser()
  if (user) {
    actor = { kind: 'user', userId: user.userId, planCode: user.planCode, ip }
  } else {
    const cookie = verifyAnonCookie(env.getCookie(ADS_ANON_COOKIE))
    if (cookie.status === 'unconfigured') return errorResponse({ code: 'service_unavailable' })
    if (cookie.status !== 'valid') return errorResponse({ code: 'session_required' })
    actor = { kind: 'anon', anonId: cookie.id, ip }
  }

  const outcome = await runScan({ address: body.data.address, requestId: body.data.requestId, actor }, env.deps)
  if (!outcome.ok) return errorResponse(outcome.error)
  return Response.json({ result: outcome.result }, { headers: { 'Cache-Control': 'no-store' } })
}

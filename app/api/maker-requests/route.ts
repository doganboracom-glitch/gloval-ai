import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { resolveRateLimitIp } from '@/lib/custom-domains/public-search/limits'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/supabase/request-user'
import type { AuthUserMetadataSummary } from '@/lib/supabase/auth-state'
import { enqueueMakerRequestEmails } from '@/lib/maker-requests/outbox'
import { checkMakerRequestEmailLimit, checkMakerRequestIpLimit } from '@/lib/maker-requests/rate-limit'
import { getMakerRequestHashSecret, hashMakerRequestIp } from '@/lib/maker-requests/security'
import { validateMakerRequestInput } from '@/lib/maker-requests/validation'

export const dynamic = 'force-dynamic'

const CONSENT_VERSION = 'kvkk-maker-request-v1'
const MAX_BODY_BYTES = 16 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function featureEnabled() {
  return process.env.MAKER_REQUESTS_ENABLED === '1'
}

function jsonError(error: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  )
}

function rateLimited(retryAfterMs: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return jsonError('rate_limited', 429, { 'Retry-After': String(retryAfterSeconds) })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getMetadataName(metadata: AuthUserMetadataSummary | undefined) {
  if (!metadata) return ''
  const fullName = metadata.full_name?.trim() || metadata.name?.trim()
  if (fullName) return fullName
  return [metadata.first_name ?? metadata.firstName, metadata.last_name ?? metadata.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .trim()
}

export async function GET() {
  if (!featureEnabled()) return jsonError('not_found', 404)

  const auth = await getRequestUser()
  if (auth.kind === 'unavailable') return jsonError('temporarily_unavailable', 503)
  if (auth.kind === 'unauthenticated') {
    return NextResponse.json(
      { prefill: { fullName: '', email: '' } },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const fullName = getMetadataName(auth.user.user_metadata)
  const email = auth.user.email ?? ''

  return NextResponse.json(
    { prefill: { fullName, email } },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: Request) {
  if (!featureEnabled()) return jsonError('not_found', 404)

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonError('invalid_input', 413)
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return jsonError('invalid_input', 400)
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return jsonError('invalid_input', 413)
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return jsonError('invalid_input', 400)
  }

  if (isRecord(body) && typeof body.companyWebsite === 'string' && body.companyWebsite.trim()) {
    return NextResponse.json({ ok: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  }

  const secret = getMakerRequestHashSecret()
  if (!secret) return jsonError('temporarily_unavailable', 503)

  const ip = resolveRateLimitIp((name) => request.headers.get(name)) ?? 'unknown'
  const ipHash = hashMakerRequestIp(ip, secret)
  const ipLimit = checkMakerRequestIpLimit(ipHash)
  if (!ipLimit.allowed) return rateLimited(ipLimit.retryAfterMs)

  const validated = validateMakerRequestInput(body)
  if (!validated.ok) {
    return jsonError(validated.reason === 'too_many_links' ? 'too_many_links' : 'invalid_input', 400)
  }

  const emailLimit = checkMakerRequestEmailLimit(validated.data.email, secret)
  if (!emailLimit.allowed) return rateLimited(emailLimit.retryAfterMs)

  const auth = await getRequestUser()
  if (auth.kind === 'unavailable') return jsonError('temporarily_unavailable', 503)

  const requestId = randomUUID()
  if (!UUID_PATTERN.test(requestId)) return jsonError('temporarily_unavailable', 500)

  try {
    const { data, error } = await createAdminClient()
      .from('maker_requests')
      .insert({
        id: requestId,
        user_id: auth.kind === 'authenticated' ? auth.user.id : null,
        full_name: validated.data.fullName,
        phone: validated.data.phone,
        email: validated.data.email,
        budget_range: validated.data.budgetRange,
        reference_links: validated.data.referenceLinks,
        status: 'new',
        consent_version: CONSENT_VERSION,
        consent_at: new Date().toISOString(),
        ip_hash: ipHash,
      })
      .select('id')
      .single()

    if (error || !data?.id) return jsonError('storage_unavailable', 503)
    await enqueueMakerRequestEmails(data.id, validated.data.lang)
  } catch {
    return jsonError('storage_unavailable', 503)
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

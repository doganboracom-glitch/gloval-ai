import { NextResponse } from 'next/server'
import { clientIpFromHeaders } from '@/lib/site-contact-guard'
import { submitSiteContact, type ContactBlockReason } from '@/lib/site-contact-service'
import { createContactDeps } from '@/lib/site-contact-store'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 8 * 1024

const BLOCK_STATUS: Record<ContactBlockReason, number> = {
  too_fast: 429,
  rate_limited: 429,
  expired: 400,
  invalid_token: 400,
  unknown_site: 404,
}

/**
 * Public endpoint for the published-site contact form. Every error carries a
 * short machine code the form turns into a specific message; the codes hold no
 * personal data, so they are also what lands in the server log.
 */
export async function POST(request: Request) {
  const raw = await request.text().catch(() => '')
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 })

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const record = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>

  let result
  try {
    result = await submitSiteContact(
      { slug: record.slug, body: record, ip: clientIpFromHeaders(request.headers) },
      createContactDeps(),
    )
  } catch (error) {
    console.log('[site-contact] E_UNEXPECTED', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ error: 'server', code: 'E_UNEXPECTED' }, { status: 503 })
  }

  if (result.ok) return NextResponse.json({ ok: true })
  if (result.kind === 'validation') return NextResponse.json({ error: 'validation', fields: result.errors }, { status: 422 })
  if (result.kind === 'blocked') {
    return NextResponse.json({ error: result.reason }, { status: BLOCK_STATUS[result.reason] })
  }
  console.log('[site-contact]', result.code)
  return NextResponse.json({ error: 'server', code: result.code }, { status: 503 })
}

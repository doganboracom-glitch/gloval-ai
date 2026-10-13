import { NextResponse } from 'next/server'
import { clientIpFromHeaders } from '@/lib/site-contact-guard'
import { submitSiteContact } from '@/lib/site-contact-service'
import { createContactDeps } from '@/lib/site-contact-store'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 8 * 1024

/** Public endpoint for the published-site contact form. Errors are deliberately vague. */
export async function POST(request: Request) {
  const raw = await request.text().catch(() => '')
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'blocked' }, { status: 413 })

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'blocked' }, { status: 400 })
  }
  const record = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>

  let result
  try {
    result = await submitSiteContact(
      { slug: record.slug, body: record, ip: clientIpFromHeaders(request.headers) },
      createContactDeps(),
    )
  } catch (error) {
    console.log('[site-contact] failed:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }

  if (result.ok) return NextResponse.json({ ok: true })
  if (result.kind === 'validation') return NextResponse.json({ error: 'validation', fields: result.errors }, { status: 422 })
  if (result.kind === 'blocked') return NextResponse.json({ error: 'blocked' }, { status: 429 })
  return NextResponse.json({ error: 'unavailable' }, { status: 503 })
}

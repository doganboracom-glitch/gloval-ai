import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/mail/admin-guard'
import { checkInvoiceLimit } from '@/lib/invoices/limit'
import { createAdminDownload } from '@/lib/invoices/service'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'no-store' }
  const actor = await getAdminUser().catch(() => null)
  if (!actor) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers })

  const limit = await checkInvoiceLimit(actor.userId, 'download')
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const { id } = await context.params
  const outcome = await createAdminDownload(actor, id)
  if (!outcome.ok) {
    const status = outcome.error === 'not_found' || outcome.error === 'invalid_input' ? 404 : 502
    return NextResponse.json({ ok: false, error: outcome.error }, { status, headers })
  }
  return NextResponse.redirect(outcome.url, { status: 302, headers })
}

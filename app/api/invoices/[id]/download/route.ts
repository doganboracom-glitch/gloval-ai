import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkInvoiceLimit } from '@/lib/invoices/limit'
import { createCustomerDownload } from '@/lib/invoices/service'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'no-store' }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers })

  const limit = await checkInvoiceLimit(user.id, 'customer_download')
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404, headers })

  // Read with the customer's own session: row level security only returns their rows.
  const { data } = await supabase
    .from('invoices')
    .select('id, user_id, billing_transaction_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!data) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404, headers })

  const outcome = await createCustomerDownload(
    { userId: user.id, email: user.email ?? '' },
    data as { id: string; user_id: string | null; billing_transaction_id: string; status: string },
  )
  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: outcome.error === 'not_found' ? 404 : 502, headers })
  }
  return NextResponse.redirect(outcome.url, { status: 302, headers })
}

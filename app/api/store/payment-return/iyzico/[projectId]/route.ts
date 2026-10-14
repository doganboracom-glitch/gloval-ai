import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { orderStatusUrl, tokenSecret } from '@/lib/store-order-access'
import { nonceMatches, verifyReturnParams } from '@/lib/store-payments/iyzico-callback'
import { loadIyzicoCredentials } from '@/lib/store-payments/iyzico-credentials'
import { settleIyzicoOrder } from '@/lib/store-payments/iyzico-settle'

export const dynamic = 'force-dynamic'

/**
 * Where iyzico sends the buyer back (POST, form-encoded) after the checkout
 * form. NOTHING in the request body is trusted: the signed `o`/`n`/`s` query
 * parameters identify the order and prove the call belongs to a payment we
 * started; the outcome itself always comes from a server-to-server retrieve
 * with the store's own keys. Replays (nonce already consumed) never reach
 * iyzico and only redirect to the order page.
 */
async function handle(request: Request, projectId: string) {
  let secret: string
  try {
    secret = tokenSecret()
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 })
  }

  const url = new URL(request.url)
  const verified = verifyReturnParams(
    { o: url.searchParams.get('o'), n: url.searchParams.get('n'), s: url.searchParams.get('s') },
    secret,
  )
  if (!verified) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('ecommerce_orders')
    .select('id, project_id, payment_status, payment_ref, payment_nonce, total_cents, currency, created_at')
    .eq('id', verified.orderId)
    .eq('project_id', projectId)
    .eq('payment_provider', 'iyzico')
    .maybeSingle()
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: project } = await admin.from('projects').select('slug').eq('id', projectId).maybeSingle()
  if (!project?.slug) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (nonceMatches(order.payment_nonce as string | null, verified.nonce)) {
    const loaded = await loadIyzicoCredentials(admin, projectId)
    if (loaded.ok) {
      try {
        await settleIyzicoOrder(admin, loaded.creds, {
          id: order.id,
          project_id: order.project_id,
          payment_status: order.payment_status,
          payment_ref: order.payment_ref,
          total_cents: order.total_cents,
          currency: order.currency,
          created_at: order.created_at,
        })
      } catch (err) {
        console.error('[store-iyzico] return settle failed', {
          orderId: order.id,
          message: err instanceof Error ? err.message : 'unknown',
        })
      }
    }
  }

  return NextResponse.redirect(orderStatusUrl(project.slug, order.id), 303)
}

export async function POST(request: Request, ctx: { params: Promise<{ projectId: string }> }) {
  return handle(request, (await ctx.params).projectId)
}

export async function GET(request: Request, ctx: { params: Promise<{ projectId: string }> }) {
  return handle(request, (await ctx.params).projectId)
}

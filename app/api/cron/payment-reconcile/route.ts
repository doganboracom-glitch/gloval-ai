import { NextResponse } from 'next/server'
import { reconcilePendingPayments } from '@/lib/payments/reconcile-store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RECONCILE_BUDGET_MS = 45_000

/** Inert until CRON_SECRET is set; Vercel Cron (see vercel.json) sends it as a Bearer token. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const summary = await reconcilePendingPayments({ limit: 50, budgetMs: RECONCILE_BUDGET_MS })
  console.log('[payment-reconcile] sweep', summary)
  return NextResponse.json({ ok: summary.errors === 0, ...summary })
}

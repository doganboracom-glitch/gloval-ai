import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGoogleAdsConnectUser } from '@/lib/ads/google-ads-route-auth'

export const runtime = 'nodejs'

export async function GET() {
  const access = await requireGoogleAdsConnectUser()
  if (!access.ok) return access.response

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ads_connections')
    .select('id,external_account_id,external_account_name,login_customer_id,currency_code,is_manager,status,updated_at')
    .eq('user_id', access.userId)
    .eq('platform', 'google_ads')
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'dashboard_unavailable' }, { status: 503 })

  return NextResponse.json(
    {
      connections: (data ?? []).map((connection) => ({
        id: connection.id,
        externalAccountId: connection.external_account_id,
        name: connection.external_account_name,
        loginCustomerId: connection.login_customer_id,
        currency: connection.currency_code,
        isManager: connection.is_manager,
        status: connection.status,
        updatedAt: connection.updated_at,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

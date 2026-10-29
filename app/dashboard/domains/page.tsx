import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyDomainsOverview } from '@/lib/custom-domains/actions'
import { parseBuyParam, buildBuyHref } from '@/lib/custom-domains/public-search/buy-link'
import { DomainsClient } from '@/components/domains/domains-client'

// Domain state changes as soon as the customer connects or verifies one, so it
// must never be served from a cached render.
export const dynamic = 'force-dynamic'

export default async function DomainsPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; buy?: string | string[] }>
}) {
  const { payment, buy } = await searchParams
  const buyDomain = parseBuyParam(buy)
  const paymentResult = payment === 'success' || payment === 'failed' || payment === 'error' ? payment : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(buyDomain ? buildBuyHref(buyDomain, false, 'login') : '/auth/login?next=/dashboard/domains')

  const overview = await getMyDomainsOverview()

  return <DomainsClient overview={overview} userEmail={user.email ?? ''} paymentResult={paymentResult} initialBuyDomain={buyDomain} />
}

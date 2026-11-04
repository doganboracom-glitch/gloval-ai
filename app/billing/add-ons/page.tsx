import { redirect } from 'next/navigation'
import { AuthUnavailableNotice } from '@/components/auth-unavailable-notice'
import { buildLegacyAddOnsRedirect } from '@/lib/billing-add-ons-route'
import { getPageAuthState } from '@/lib/supabase/page-auth'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AddOnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const supabase = await createClient()
  const authState = await getPageAuthState(supabase)
  if (authState.kind === 'unavailable') return <AuthUnavailableNotice />

  redirect(buildLegacyAddOnsRedirect(query, authState.kind === 'authenticated'))
}

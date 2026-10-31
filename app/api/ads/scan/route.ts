import { cookies } from 'next/headers'
import { getPlanCodeForUser } from '@/lib/billing'
import { isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'
import { createDefaultScanDeps } from '@/lib/ads/scan-deps'
import { handleScanRequest } from '@/lib/ads/scan-handler'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const jar = await cookies()
  return handleScanRequest(request, {
    featureEnabled: isAdsFeatureUiEnabled(),
    getCookie: (name) => jar.get(name)?.value,
    deps: createDefaultScanDeps(),
    getUser: async () => {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) return null
      return { userId: data.user.id, planCode: await getPlanCodeForUser(data.user.id) }
    },
  })
}

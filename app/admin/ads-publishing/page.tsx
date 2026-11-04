import { GoogleAdsPublishRecoveryView } from '@/components/admin/google-ads-publish-recovery-view'
import { listStuckGoogleAdsPublishes } from '@/lib/admin/google-ads-publish-recovery'

export const dynamic = 'force-dynamic'

export default async function AdminGoogleAdsPublishRecoveryPage() {
  const list = await listStuckGoogleAdsPublishes()
  return <GoogleAdsPublishRecoveryView list={list} />
}

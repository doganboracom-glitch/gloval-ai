import { BillingProfilesView } from '@/components/admin/billing-profiles-view'
import { listAdminBillingProfileAccessHistory, listAdminBillingProfiles } from '@/lib/admin/billing-profile-data'

export const dynamic = 'force-dynamic'

export default async function AdminBillingProfilesPage() {
  const [result, history] = await Promise.all([listAdminBillingProfiles(), listAdminBillingProfileAccessHistory()])
  return <BillingProfilesView available={result.available} rows={result.rows} history={history} />
}

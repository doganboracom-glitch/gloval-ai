import { BillingProfilesView } from '@/components/admin/billing-profiles-view'
import { listAdminBillingProfiles } from '@/lib/admin/billing-profile-data'

export const dynamic = 'force-dynamic'

export default async function AdminBillingProfilesPage() {
  const result = await listAdminBillingProfiles()
  return <BillingProfilesView available={result.available} rows={result.rows} />
}

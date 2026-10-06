import { listSubscriptions } from '@/lib/admin/queries'
import { BillingView } from '@/components/admin/billing-view'

export const dynamic = 'force-dynamic'

export default async function AdminBillingPage() {
  const subscriptions = await listSubscriptions()
  return <BillingView subscriptions={subscriptions} />
}

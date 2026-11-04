import { AdminMakerRequestsView } from '@/components/admin/maker-requests-view'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { getMakerRequests } from '@/lib/maker-requests/admin-data'

export const dynamic = 'force-dynamic'

export default async function AdminMakerRequestsPage() {
  await requireAdmin()
  const { items, schemaReady } = await getMakerRequests()

  return <AdminMakerRequestsView items={items} schemaReady={schemaReady} />
}

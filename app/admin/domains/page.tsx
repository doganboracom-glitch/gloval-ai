import { requireAdmin } from '@/lib/mail/admin-guard'
import { listDomains } from '@/lib/admin/queries'
import { DomainsView } from '@/components/admin/domains-view'

export const dynamic = 'force-dynamic'

export default async function AdminDomainsPage() {
  await requireAdmin()
  const domains = await listDomains()
  return <DomainsView domains={domains} />
}

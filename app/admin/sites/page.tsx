import { listSites } from '@/lib/admin/queries'
import { SitesView } from '@/components/admin/sites-view'

export const dynamic = 'force-dynamic'

export default async function AdminSitesPage() {
  const sites = await listSites()
  return <SitesView sites={sites} />
}

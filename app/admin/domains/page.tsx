import { requireAdmin } from '@/lib/mail/admin-guard'
import { listDomains } from '@/lib/admin/queries'
import { listPendingRegistrarDomainImports } from '@/lib/custom-domains/registrar/admin-import-service'
import { DomainsView } from '@/components/admin/domains-view'

export const dynamic = 'force-dynamic'

export default async function AdminDomainsPage() {
  await requireAdmin()
  const [domains, importQueue] = await Promise.all([
    listDomains(),
    listPendingRegistrarDomainImports(),
  ])
  return (
    <DomainsView
      domains={domains}
      pendingImports={importQueue.items}
      importQueueReady={importQueue.ready}
    />
  )
}

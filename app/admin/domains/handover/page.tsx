import { requireAdmin } from '@/lib/mail/admin-guard'
import { PageHeader } from '@/components/admin/admin-ui'
import { HandoverClient } from '@/components/admin/domain-handover'

export const dynamic = 'force-dynamic'

export default async function AdminDomainHandoverPage() {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <PageHeader title="Alan adı devri" subtitle="Registrar alan adının sahipliğini başka bir hesaba devreder." />
      <HandoverClient />
    </div>
  )
}

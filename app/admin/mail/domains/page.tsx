import { adminListDomains } from '@/lib/mail'
import { MailDomains } from '@/components/admin/mail-domains'

export const dynamic = 'force-dynamic'

export default async function AdminMailDomainsPage() {
  const domains = await adminListDomains()
  return <MailDomains domains={domains} />
}

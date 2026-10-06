import { adminListAliases } from '@/lib/mail'
import { MailAliases } from '@/components/admin/mail-aliases'

export const dynamic = 'force-dynamic'

export default async function AdminMailAliasesPage() {
  const aliases = await adminListAliases()
  return <MailAliases aliases={aliases} />
}

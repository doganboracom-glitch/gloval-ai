import { adminListMailboxes } from '@/lib/mail'
import { MailMailboxes } from '@/components/admin/mail-mailboxes'

export const dynamic = 'force-dynamic'

export default async function AdminMailMailboxesPage() {
  const mailboxes = await adminListMailboxes()
  return <MailMailboxes mailboxes={mailboxes} />
}

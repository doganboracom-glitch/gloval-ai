import { adminListLogs } from '@/lib/mail'
import { MailLogs } from '@/components/admin/mail-logs'

export const dynamic = 'force-dynamic'

export default async function AdminMailLogsPage() {
  // Filtering happens client-side over this page-sized window, so changing a
  // filter does not cost a round trip.
  const logs = await adminListLogs()
  return <MailLogs logs={logs} />
}

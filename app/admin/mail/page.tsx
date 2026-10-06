import { adminMailStats, adminListLogs } from '@/lib/mail'
import { MailOverview } from '@/components/admin/mail-overview'

export const dynamic = 'force-dynamic'

export default async function AdminMailOverviewPage() {
  const [stats, logs] = await Promise.all([adminMailStats(), adminListLogs()])
  return <MailOverview stats={stats} recent={logs.slice(0, 8)} />
}

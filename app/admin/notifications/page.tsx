import { requireAdmin } from "@/lib/mail/admin-guard"
import { listNotifications } from "@/lib/admin/queries"
import { NotificationsView } from "@/components/admin/notifications-view"

export const dynamic = "force-dynamic"

export default async function AdminNotificationsPage() {
  await requireAdmin()
  const notifications = await listNotifications()
  return <NotificationsView notifications={notifications} />
}

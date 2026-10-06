import { requireAdmin } from "@/lib/mail/admin-guard"
import { listTickets } from "@/lib/admin/queries"
import { SupportView } from "@/components/admin/support-view"

export const dynamic = "force-dynamic"

export default async function AdminSupportPage() {
  await requireAdmin()
  const tickets = await listTickets()
  return <SupportView tickets={tickets} />
}

import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/mail/admin-guard"
import { getTicketDetail } from "@/lib/admin/queries"
import { TicketDetailView } from "@/components/admin/ticket-detail-view"

export const dynamic = "force-dynamic"

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const detail = await getTicketDetail(id)
  if (!detail) notFound()
  return <TicketDetailView ticket={detail.ticket} messages={detail.messages} />
}

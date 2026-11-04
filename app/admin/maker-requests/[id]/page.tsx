import { notFound } from 'next/navigation'
import { MakerRequestDetailView } from '@/components/admin/maker-request-detail-view'
import { requireAdmin } from '@/lib/mail/admin-guard'
import { getMakerRequest } from '@/lib/maker-requests/admin-data'

export const dynamic = 'force-dynamic'

export default async function AdminMakerRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const request = await getMakerRequest(id)
  if (!request) notFound()

  return <MakerRequestDetailView request={request} />
}

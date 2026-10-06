import { notFound } from 'next/navigation'
import { getUserDetail, getUserPackageDetail } from '@/lib/admin/queries'
import { UserDetailView } from '@/components/admin/user-detail-view'
import { PackageManager } from '@/components/admin/package-manager'

export const dynamic = 'force-dynamic'

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getUserDetail(id)
  if (!detail) notFound()
  const pkg = await getUserPackageDetail(id)
  return (
    <UserDetailView
      user={detail.user}
      sites={detail.sites}
      credits={detail.credits}
      packageSection={<PackageManager user={detail.user} detail={pkg} />}
    />
  )
}

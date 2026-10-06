import { listUsers } from '@/lib/admin/queries'
import { UsersView } from '@/components/admin/users-view'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const users = await listUsers()
  return <UsersView users={users} />
}

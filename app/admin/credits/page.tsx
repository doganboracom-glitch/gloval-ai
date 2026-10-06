import { listCredits, listUsers } from '@/lib/admin/queries'
import { CreditsView } from '@/components/admin/credits-view'
import type { AdminCreditUser } from '@/lib/admin/queries'

export const dynamic = 'force-dynamic'

export default async function AdminCreditsPage() {
  const [credits, users] = await Promise.all([listCredits(), listUsers()])

  // Merge every user into the balances table (users with no ledger show 0), so
  // the gift form's email lookup covers everyone, not only those with credits.
  const byId = new Map<string, AdminCreditUser>()
  for (const c of credits.users) byId.set(c.userId, c)
  const merged: AdminCreditUser[] = users
    .map(
      (u) =>
        byId.get(u.id) ?? {
          userId: u.id,
          email: u.email,
          fullName: u.fullName,
          balance: 0,
          gifted: 0,
        },
    )
    .sort((a, b) => b.balance - a.balance)

  return <CreditsView users={merged} recent={credits.recent} totalGifted={credits.totalGifted} />
}

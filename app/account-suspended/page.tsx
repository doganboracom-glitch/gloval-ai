import type { Metadata } from 'next'
import { AccountSuspended } from '@/components/account-suspended'
import { SUPPORT_EMAIL } from '@/lib/notify'

export const metadata: Metadata = {
  title: 'Hesap askıya alındı · Gloval AI',
  robots: { index: false, follow: false },
}

export default function AccountSuspendedPage() {
  return <AccountSuspended supportEmail={SUPPORT_EMAIL} />
}

import { LanguageProvider } from '@/components/language-provider'
import { ReferralPartnersAdminView } from '@/components/admin/referral-partners-admin-view'
import { ReferralPartnerCard } from '@/components/settings/referral-partner-card'
import type { ReferralAdminPartner, ReferralPartnerSettings } from '@/lib/referrals/partner-types'

export const dynamic = 'force-dynamic'

const previewPartners: ReferralAdminPartner[] = [
  {
    partnerId: '11111111-1111-4111-8111-111111111111',
    referralCode: 'NOVA27KF4QW8',
    maskedEmail: 'n***@example.test',
    status: 'active',
    activatedAt: '2026-10-21T09:30:00.000Z',
    lastStatusChangedAt: '2026-11-02T14:15:00.000Z',
    ibanLast4: '4821',
    clicks: 1842,
    signups: 96,
    verifiedSignups: 74,
    paidCustomers: 18,
  },
  {
    partnerId: '22222222-2222-4222-8222-222222222222',
    referralCode: 'MAVI83XZ71PQ',
    maskedEmail: 'm***@example.test',
    status: 'suspended',
    activatedAt: '2026-10-30T13:05:00.000Z',
    lastStatusChangedAt: '2026-11-03T10:45:00.000Z',
    ibanLast4: '7714',
    clicks: 641,
    signups: 32,
    verifiedSignups: 21,
    paidCustomers: 5,
  },
  {
    partnerId: '33333333-3333-4333-8333-333333333333',
    referralCode: 'LUNA45QW9R2T',
    maskedEmail: 'l***@example.test',
    status: 'closed',
    activatedAt: '2026-10-04T08:20:00.000Z',
    lastStatusChangedAt: '2026-10-29T16:40:00.000Z',
    ibanLast4: null,
    clicks: 119,
    signups: 8,
    verifiedSignups: 6,
    paidCustomers: 2,
  },
]

const previewPartner: ReferralPartnerSettings = {
  referralCode: 'NOVA27KF4QW8',
  status: 'active',
  ibanLast4: '4821',
}

export default async function ReferralPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>
}) {
  const { screen } = await searchParams
  const isSettings = screen === 'settings'

  return (
    <LanguageProvider initialLang="tr">
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        {isSettings ? (
          <section className="mx-auto w-full max-w-3xl">
            <h1 className="mb-4 text-xl font-semibold text-foreground">Yerel fixture · Ayarlar</h1>
            <ReferralPartnerCard enabled partner={previewPartner} />
          </section>
        ) : (
          <ReferralPartnersAdminView partners={previewPartners} />
        )}
      </main>
    </LanguageProvider>
  )
}

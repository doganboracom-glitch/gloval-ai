import type { CSSProperties } from 'react'
import { ReferralDashboardPanel } from '@/components/dashboard/referral-dashboard-panel'
import { ReferralPartnerCard } from '@/components/settings/referral-partner-card'
import type {
  ReferralDashboardData,
  ReferralPartnerSettings,
  ReferralPayoutPanelData,
} from '@/lib/referrals/partner-types'

const dashboardData: ReferralDashboardData = {
  referralCode: 'PARTNER1234',
  clicks: 1432,
  signups: 89,
  verifiedSignups: 76,
  paidCustomers: 18,
  customers: [
    {
      maskedEmail: 'a***@example.com',
      accountDeleted: false,
      status: 'paid',
      createdAt: '2026-10-21T12:00:00.000Z',
    },
    {
      maskedEmail: 's***@example.com',
      accountDeleted: false,
      status: 'verified',
      createdAt: '2026-10-18T12:00:00.000Z',
    },
  ],
}

const partner: ReferralPartnerSettings = {
  referralCode: dashboardData.referralCode,
  status: 'active',
  ibanLast4: '4321',
}

const payoutData: ReferralPayoutPanelData = {
  unavailable: false,
  state: {
    partnerStatus: 'active',
    taxStatus: 'individual',
    taxVerified: true,
    hasIban: true,
    pendingCents: 24_500,
    availableCents: 132_500,
    totalCents: 157_000,
    convertibleCents: 157_000,
    maxCreditCents: 157_000,
    maxCashCents: 132_500,
    hasDebtBucket: false,
    partialPayoutsAvailable: true,
    requestedCents: 0,
    convertedCents: 0,
    paidCents: 0,
    hasOpenCashRequest: false,
  },
}

const lightTheme = {
  colorScheme: 'light',
  '--background': 'oklch(0.985 0.004 286)',
  '--foreground': 'oklch(0.18 0.018 288)',
  '--card': 'oklch(1 0 0)',
  '--card-foreground': 'oklch(0.18 0.018 288)',
  '--primary': 'oklch(0.58 0.18 298)',
  '--primary-foreground': 'oklch(0.99 0.003 286)',
  '--secondary': 'oklch(0.94 0.008 288)',
  '--secondary-foreground': 'oklch(0.22 0.018 288)',
  '--muted': 'oklch(0.95 0.008 288)',
  '--muted-foreground': 'oklch(0.42 0.02 288)',
  '--border': 'oklch(0.88 0.01 288)',
  '--input': 'oklch(0.9 0.01 288)',
  '--ring': 'oklch(0.58 0.18 298)',
} as unknown as CSSProperties

export default async function ReferralPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ surface?: string; theme?: string }>
}) {
  const { surface, theme } = await searchParams
  const isSettings = surface === 'settings'
  const themeStyle = theme === 'light' ? lightTheme : undefined

  return (
    <main className="min-h-svh bg-background px-4 py-8 text-foreground" style={themeStyle}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {isSettings ? (
          <section id="settings-preview" aria-labelledby="settings-preview-title">
            <h1 id="settings-preview-title" className="text-2xl font-semibold tracking-tight">
              Ayarlar
            </h1>
            <ReferralPartnerCard
              enabled
              partner={partner}
              dashboardData={dashboardData}
              payoutData={payoutData}
              payoutsEnabled
              cashPayoutsEnabled
            />
          </section>
        ) : (
          <section id="dashboard-preview" aria-labelledby="dashboard-preview-title">
            <h1 id="dashboard-preview-title" className="mb-5 text-2xl font-semibold tracking-tight">
              Projelerim
            </h1>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Örnek projeler">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="font-medium">Proje örneği</p>
                <p className="mt-1 text-sm text-muted-foreground">Yayındaki web siteniz</p>
              </div>
            </div>
            <ReferralDashboardPanel
              data={dashboardData}
              enabled
              hasPartner
              payoutData={payoutData}
              payoutsEnabled
            />
          </section>
        )}
      </div>
    </main>
  )
}

import { ReferralPayoutsAdminTable } from '@/components/admin/referral-payouts-admin-table'
import { ReferralDashboardPanel } from '@/components/dashboard/referral-dashboard-panel'
import { ReferralPartnerCard } from '@/components/settings/referral-partner-card'
import type {
  ReferralDashboardData,
  ReferralPayoutAdminRequest,
  ReferralPayoutAdminSummary,
  ReferralPayoutPanelData,
} from '@/lib/referrals/partner-types'

const partner = { referralCode: 'ORTAK2026', status: 'active' as const, ibanLast4: '1204' }

const belowThreshold: ReferralPayoutPanelData = {
  unavailable: false,
  state: {
    partnerStatus: 'active',
    taxStatus: 'individual',
    taxVerified: false,
    hasIban: true,
    pendingCents: 0,
    availableCents: 12_105,
    totalCents: 12_105,
    requestedCents: 0,
    convertedCents: 0,
    paidCents: 0,
    hasOpenCashRequest: false,
  },
}

const aboveThreshold: ReferralPayoutPanelData = {
  unavailable: false,
  state: {
    ...belowThreshold.state!,
    availableCents: 101_250,
    totalCents: 101_250,
  },
}

const dashboard: ReferralDashboardData = {
  referralCode: 'ORTAK2026',
  clicks: 248,
  signups: 31,
  verifiedSignups: 24,
  paidCustomers: 7,
  customers: [
    { maskedEmail: '', accountDeleted: true, status: 'verified', createdAt: '2026-11-03T12:00:00.000Z' },
    { maskedEmail: 'd***@ornek.com', accountDeleted: false, status: 'paid', createdAt: '2026-11-02T09:30:00.000Z' },
    { maskedEmail: 'a***@ornek.com', accountDeleted: false, status: 'signup', createdAt: '2026-11-01T16:45:00.000Z' },
  ],
}

const adminRequests: ReferralPayoutAdminRequest[] = [
  {
    requestId: '55555555-5555-4555-8555-555555555555',
    partnerId: '22222222-2222-4222-8222-222222222222',
    referralCode: 'ORTAK2026',
    partnerStatus: 'active',
    maskedEmail: 'o***@ornek.com',
    payeeName: 'Örnek Ticaret A.Ş.',
    taxStatus: 'company',
    taxVerifiedAt: null,
    ibanLast4: '1204',
    method: 'cash',
    balanceCents: 121_050,
    payoutCents: 145_260,
    creditAmount: null,
    systemTopupCents: 0,
    invoiceRequired: true,
    invoiceConfirmed: false,
    invoiceReference: null,
    invoiceReceivedAt: null,
    paymentReference: null,
    adminNote: null,
    status: 'requested',
    requestedAt: '2026-11-04T10:30:00.000Z',
    processedAt: null,
    rejectionReason: null,
  },
  {
    requestId: '66666666-6666-4666-8666-666666666666',
    partnerId: '33333333-3333-4333-8333-333333333333',
    referralCode: 'AIORTAK42',
    partnerStatus: 'active',
    maskedEmail: 'a***@ornek.com',
    payeeName: 'Ada Örnek',
    taxStatus: 'individual',
    taxVerifiedAt: '2026-11-01T12:00:00.000Z',
    ibanLast4: '7788',
    method: 'credit',
    balanceCents: 88_200,
    payoutCents: 88_200,
    creditAmount: 295,
    systemTopupCents: 300,
    invoiceRequired: false,
    invoiceConfirmed: false,
    invoiceReference: null,
    invoiceReceivedAt: null,
    paymentReference: null,
    adminNote: null,
    status: 'processed',
    requestedAt: '2026-11-02T09:00:00.000Z',
    processedAt: '2026-11-02T09:02:00.000Z',
    rejectionReason: null,
  },
]

const adminSummary: ReferralPayoutAdminSummary = {
  pendingCents: 242_100,
  availableCents: 121_050,
  convertedCents: 88_200,
  systemTopupCents: 300,
  paidCents: 0,
  openCashRequests: 1,
}

export default async function ReferralPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>
}) {
  const { scenario = 'below' } = await searchParams

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-col gap-1 border-b border-border pb-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">GLOVAL AI · Yerel örnek veri</p>
          <h1 className="text-xl font-semibold tracking-tight">
            {scenario === 'enabled' ? 'Ödeme isteği önizlemesi' : scenario === 'admin' ? 'Yönetici ödemeleri' : 'Satış ortaklığı görünümü'}
          </h1>
        </header>

        {scenario === 'enabled' ? (
          <ReferralPartnerCard
            enabled
            partner={partner}
            payoutData={aboveThreshold}
            payoutsEnabled
            cashPayoutsEnabled
          />
        ) : scenario === 'admin' ? (
          <ReferralPayoutsAdminTable
            requests={adminRequests}
            summary={adminSummary}
            enabled
          />
        ) : (
          <>
            <ReferralPartnerCard
              enabled
              partner={partner}
              payoutData={belowThreshold}
              payoutsEnabled
              cashPayoutsEnabled
            />
            <ReferralDashboardPanel
              data={dashboard}
              payoutData={belowThreshold}
              payoutsEnabled
              cashPayoutsEnabled
            />
          </>
        )}
      </div>
    </main>
  )
}

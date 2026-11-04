'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ReferralPartnersAdminTable } from '@/components/admin/referral-partners-admin-table'
import { ReferralPayoutsAdminTable } from '@/components/admin/referral-payouts-admin-table'
import type {
  ReferralAdminPartner,
  ReferralPayoutAdminRequest,
  ReferralPayoutAdminSummary,
} from '@/lib/referrals/partner-types'

type AdminLanguage = 'tr' | 'en'

type AdminCopy = {
  title: string
  description: string
  back: string
  records: string
  privacy: string
  unavailable: string
  totalPartners: string
  active: string
  suspended: string
  closed: string
  clicks: string
  signups: string
  verifiedSignups: string
  paidCustomers: string
}

const copyByLanguage: Record<AdminLanguage, AdminCopy> = {
  tr: {
    title: 'Satış ortakları',
    description: 'Ortak durumlarını yönetin, performansı ve ödeme taleplerini inceleyin, tüm işlemleri denetleyin.',
    back: 'Yönetim paneli',
    records: 'Ortak kayıtları ve etkinlik',
    privacy: 'E-posta adresleri sunucu tarafında maskelenir; yalnızca IBAN’ın son 4 hanesi gösterilir. Tutar veya tam IBAN gösterilmez.',
    unavailable: 'Satış ortaklığı yönetim verileri şu anda yüklenemiyor.',
    totalPartners: 'Toplam ortak',
    active: 'Aktif',
    suspended: 'Askıda',
    closed: 'Kapalı',
    clicks: 'Toplam tıklama',
    signups: 'Toplam kayıt',
    verifiedSignups: 'Doğrulanmış kayıt',
    paidCustomers: 'Ücretli müşteri',
  },
  en: {
    title: 'Referral partners',
    description: 'Manage partner status, review activity and payout requests, and audit every change.',
    back: 'Admin dashboard',
    records: 'Partner records and activity',
    privacy: 'Email addresses are masked server-side; only the last 4 IBAN digits are shown. No amounts or full IBANs are displayed.',
    unavailable: 'Referral partner management data is temporarily unavailable.',
    totalPartners: 'Total partners',
    active: 'Active',
    suspended: 'Suspended',
    closed: 'Closed',
    clicks: 'Total clicks',
    signups: 'Total signups',
    verifiedSignups: 'Verified signups',
    paidCustomers: 'Paid customers',
  },
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value)
}

function getSummary(partners: ReferralAdminPartner[]) {
  return partners.reduce((summary, partner) => {
    summary.totalPartners += 1
    summary[partner.status] += 1
    summary.clicks += partner.clicks
    summary.signups += partner.signups
    summary.verifiedSignups += partner.verifiedSignups
    summary.paidCustomers += partner.paidCustomers
    return summary
  }, {
    totalPartners: 0,
    active: 0,
    suspended: 0,
    closed: 0,
    clicks: 0,
    signups: 0,
    verifiedSignups: 0,
    paidCustomers: 0,
  })
}

export function ReferralPartnersAdminView({
  partners,
  unavailable = false,
  payoutsEnabled = false,
  payoutRequests = [],
  payoutSummary = null,
  payoutsUnavailable = false,
}: {
  partners: ReferralAdminPartner[]
  unavailable?: boolean
  payoutsEnabled?: boolean
  payoutRequests?: ReferralPayoutAdminRequest[]
  payoutSummary?: ReferralPayoutAdminSummary | null
  payoutsUnavailable?: boolean
}) {
  const { lang } = useLanguage()
  const language: AdminLanguage = lang === 'tr' ? 'tr' : 'en'
  const copy = copyByLanguage[language]
  const locale = language === 'tr' ? 'tr-TR' : 'en-US'
  const summary = getSummary(partners)
  const cards = [
    { label: copy.totalPartners, value: summary.totalPartners },
    { label: copy.active, value: summary.active },
    { label: copy.suspended, value: summary.suspended },
    { label: copy.closed, value: summary.closed },
    { label: copy.clicks, value: summary.clicks },
    { label: copy.signups, value: summary.signups },
    { label: copy.verifiedSignups, value: summary.verifiedSignups },
    { label: copy.paidCustomers, value: summary.paidCustomers },
  ]

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{copy.title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
        </div>
        <Link
          href="/admin"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {copy.back}
        </Link>
      </div>

      {unavailable ? (
        <Alert variant="destructive">
          <AlertDescription>{copy.unavailable}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {cards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="pb-2">
                  <CardDescription>{card.label}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-foreground">{formatNumber(card.value, locale)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{copy.records}</CardTitle>
              <CardDescription>{copy.privacy}</CardDescription>
            </CardHeader>
            <CardContent>
              <ReferralPartnersAdminTable partners={partners} />
            </CardContent>
          </Card>
          <ReferralPayoutsAdminTable
            enabled={payoutsEnabled}
            requests={payoutRequests}
            summary={payoutSummary}
            unavailable={payoutsUnavailable}
          />
        </>
      )}
    </section>
  )
}

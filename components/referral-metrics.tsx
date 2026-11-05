'use client'

import { useLanguage } from '@/components/language-provider'
import type { ReferralDashboardData } from '@/lib/referrals/partner-types'

type MetricsCopy = {
  group: string
  clicks: string
  signups: string
  paidCustomers: string
  conversion: string
  clickToPaid: string
}

const COPY = {
  tr: {
    group: 'Yönlendirme istatistikleri',
    clicks: 'Tıklama',
    signups: 'Kayıt',
    paidCustomers: 'Ücretli müşteri',
    conversion: 'Dönüşüm yüzdesi',
    clickToPaid: 'tıklamadan ücretli müşteriye',
  },
  en: {
    group: 'Referral statistics',
    clicks: 'Clicks',
    signups: 'Signups',
    paidCustomers: 'Paid customers',
    conversion: 'Conversion rate',
    clickToPaid: 'from clicks to paid customers',
  },
} satisfies Record<'tr' | 'en', MetricsCopy>

export function ReferralMetrics({ data }: { data: ReferralDashboardData }) {
  const { lang } = useLanguage()
  const language = lang === 'tr' ? 'tr' : 'en'
  const copy = COPY[language]
  const formatter = new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-US')
  const percentFormatter = new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
    maximumFractionDigits: 1,
  })
  const conversion = data.clicks > 0 ? (data.paidCustomers / data.clicks) * 100 : 0
  const metrics: { label: string; value: string; accessibleValue?: string }[] = [
    { label: copy.clicks, value: formatter.format(data.clicks) },
    { label: copy.signups, value: formatter.format(data.signups) },
    { label: copy.paidCustomers, value: formatter.format(data.paidCustomers) },
    {
      label: copy.conversion,
      value: `${percentFormatter.format(conversion)}%`,
      accessibleValue: `${percentFormatter.format(conversion)}% ${copy.clickToPaid}`,
    },
  ]

  return (
    <dl
      aria-label={copy.group}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 rounded-md bg-muted/30 px-3 py-2">
          <dt className="text-sm leading-5 text-muted-foreground">{metric.label}</dt>
          <dd
            aria-label={metric.accessibleValue}
            className="mt-1 text-base font-semibold leading-5 tabular-nums text-foreground"
          >
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

'use client'

import Link from 'next/link'
import { Building2, ShoppingBag, Sparkles } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import type { CreditSummary, SiteCapacity } from '@/lib/billing-summary'

const COPY = {
  tr: {
    siteTitle: 'Site kapasitesi',
    total: 'Toplam kapasite',
    used: 'Yayında kullanılan',
    remaining: 'Kalan',
    corporate: 'Kurumsal',
    ecommerce: 'E-ticaret',
    ecommerceRight: 'E-ticaret hakkı',
    ecommerceNote: 'Ek site hizmetleri e-ticaret hakkını artırmaz.',
    creditTitle: 'AI kredileri',
    balance: 'Mevcut bakiye',
    granted: 'Bu dönem verilen',
    consumed: 'Bu dönem kullanılan',
    renewal: 'Sonraki yenileme',
    oneTime: 'Tek seferlik hediye; yenilenmez.',
    perPeriod: 'Her dönem +{n} AI kredisi',
    firstPeriod: 'İlk dönem {n}',
    rollover: 'Kullanılmayan krediler devreder',
    noRollover: 'Kullanılmayan krediler devretmez',
    max: 'En fazla {n} bakiye',
    manage: 'Ek hizmetleri görüntüle',
    credits: 'AI işlemi',
  },
  en: {
    siteTitle: 'Site capacity',
    total: 'Total capacity',
    used: 'Published',
    remaining: 'Remaining',
    corporate: 'Corporate',
    ecommerce: 'E-commerce',
    ecommerceRight: 'E-commerce allowance',
    ecommerceNote: 'Extra-site add-ons do not raise the e-commerce allowance.',
    creditTitle: 'AI credits',
    balance: 'Current balance',
    granted: 'Granted this period',
    consumed: 'Used this period',
    renewal: 'Next renewal',
    oneTime: 'One-time grant; does not renew.',
    perPeriod: '+{n} AI credits every period',
    firstPeriod: 'First period {n}',
    rollover: 'Unused credits roll over',
    noRollover: 'Unused credits do not roll over',
    max: 'Up to {n} balance',
    manage: 'View add-ons',
    credits: 'AI credits',
  },
} as const

function fill(template: string, n: number) {
  return template.replace('{n}', String(n))
}

function Stat({ label, value, emphasis = false }: { label: string; value: string | number; emphasis?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-0.5 font-display text-lg font-semibold tabular-nums ${emphasis ? 'text-brand' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}

export function SiteCapacityCard({ capacity }: { capacity: SiteCapacity | null }) {
  const { lang } = useLanguage()
  const c = lang === 'tr' ? COPY.tr : COPY.en
  if (!capacity) return null

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{c.siteTitle}</h2>
        <Link
          href="/billing/add-ons"
          className="rounded-lg border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
        >
          {c.manage}
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={c.total} value={capacity.total} />
        <Stat label={c.used} value={capacity.used} />
        <Stat label={c.remaining} value={capacity.remaining} emphasis />
      </dl>
      <ul className="mt-4 flex flex-col gap-2 text-sm">
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="size-4" aria-hidden />
            {c.corporate}
          </span>
          <span className="font-medium tabular-nums">{capacity.usedCorporate}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <ShoppingBag className="size-4" aria-hidden />
            {c.ecommerce}
          </span>
          <span className="font-medium tabular-nums">
            {capacity.usedEcommerce}
            <span className="text-muted-foreground">
              {' '}
              / {capacity.ecommerceLimit} {c.ecommerceRight.toLowerCase()}
            </span>
          </span>
        </li>
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{c.ecommerceNote}</p>
    </div>
  )
}

export function CreditSummaryCard({ summary }: { summary: CreditSummary }) {
  const { lang } = useLanguage()
  const c = lang === 'tr' ? COPY.tr : COPY.en
  const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' })
  const isFree = summary.planCode === 'free'

  const rules: string[] = []
  if (isFree) {
    rules.push(c.oneTime)
  } else {
    if (summary.periodAllowance !== null) rules.push(fill(c.perPeriod, summary.periodAllowance))
    if (summary.firstPeriodAllowance !== null) rules.push(fill(c.firstPeriod, summary.firstPeriodAllowance))
    rules.push(summary.rollover ? c.rollover : c.noRollover)
    if (summary.maxBalance !== null) rules.push(fill(c.max, summary.maxBalance))
  }

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-6">
      <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Sparkles className="size-4 text-brand" aria-hidden />
        {c.creditTitle}
      </h2>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={c.balance} value={summary.balance} emphasis />
        <Stat label={c.granted} value={summary.grantedThisPeriod} />
        <Stat label={c.consumed} value={summary.usedThisPeriod} />
      </dl>
      {summary.nextRenewal ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {c.renewal}:{' '}
          <span className="font-medium text-foreground">
            {dateFmt.format(new Date(summary.nextRenewal))}
          </span>
        </p>
      ) : null}
      <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {rules.map((rule) => (
          <li key={rule} className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
            {rule}
          </li>
        ))}
      </ul>
    </div>
  )
}

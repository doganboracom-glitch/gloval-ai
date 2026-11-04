'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, MousePointerClick, UserRoundCheck, Users, WalletCards } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ReferralPayoutControls } from '@/components/settings/referral-payout-controls'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { ReferralCustomerStatus, ReferralDashboardData, ReferralPayoutPanelData } from '@/lib/referrals/partner-types'

const COPY = {
  tr: {
    title: 'Satış ortaklığı',
    description: 'Yönlendirme bağlantınızın tıklama ve kayıt sonuçları.',
    clicks: 'Tıklamalar',
    signups: 'Kayıt olan',
    verified: 'E-posta doğrulandı',
    paid: 'Ücretli müşteri',
    conversion: 'Dönüşüm',
    clickToSignup: 'Tıklama → kayıt',
    signupToPaid: 'Kayıt → ücretli',
    link: 'Yönlendirme bağlantınız',
    copy: 'Bağlantıyı kopyala',
    copied: 'Kopyalandı',
    copyFailed: 'Bağlantı kopyalanamadı.',
    customers: 'Yönlendirilen müşteriler',
    noCustomers: 'Henüz yönlendirme kaydı yok.',
    statuses: { signup: 'Kayıt oldu', verified: 'Doğrulandı', paid: 'Ücretli' },
    date: 'Kayıt tarihi',
    deleted: 'Üye tarafından silindi',
    deletedAccount: 'Silinmiş hesap',
    jumpToSection: '↓ Satış Ortaklığı',
  },
  en: {
    title: 'Referral partnership',
    description: 'Clicks and signup outcomes for your referral link.',
    clicks: 'Clicks',
    signups: 'Signups',
    verified: 'Email verified',
    paid: 'Paid customers',
    conversion: 'Conversion',
    clickToSignup: 'Click → signup',
    signupToPaid: 'Signup → paid',
    link: 'Your referral link',
    copy: 'Copy link',
    copied: 'Copied',
    copyFailed: 'Could not copy the link.',
    customers: 'Referred customers',
    noCustomers: 'No referrals yet.',
    statuses: { signup: 'Signed up', verified: 'Verified', paid: 'Paid' },
    date: 'Signup date',
    deleted: 'Deleted by member',
    deletedAccount: 'Deleted account',
    jumpToSection: '↓ Referral partnership',
  },
} as const

const STATUS_VARIANT: Record<ReferralCustomerStatus, 'secondary' | 'default'> = {
  signup: 'secondary',
  verified: 'secondary',
  paid: 'default',
}

export function ReferralDashboardPanel({
  data,
  payoutData = null,
  payoutsEnabled = false,
  cashPayoutsEnabled = false,
}: {
  data: ReferralDashboardData | null
  payoutData?: ReferralPayoutPanelData | null
  payoutsEnabled?: boolean
  cashPayoutsEnabled?: boolean
}) {
  const { lang } = useLanguage()
  const language = lang === 'tr' ? 'tr' : 'en'
  const copy = COPY[language]
  const sectionRef = useRef<HTMLElement>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [sectionVisible, setSectionVisible] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    if (!section || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => setSectionVisible(entry.isIntersecting),
      { threshold: 0.15 },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [data])

  if (!data) return null

  const referralUrl = `https://gloval.ai/?ref=${data.referralCode}`
  const formatter = new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-US')
  const percentFormatter = new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
    maximumFractionDigits: 1,
  })
  const clickToSignup = data.clicks > 0 ? (data.signups / data.clicks) * 100 : 0
  const signupToPaid = data.signups > 0 ? (data.paidCustomers / data.signups) * 100 : 0

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <>
    <section ref={sectionRef} id="satis-ortakligi" aria-labelledby="referral-dashboard-title" className="mt-8 flex flex-col gap-4 scroll-mt-8">
      <div>
        <h2 id="referral-dashboard-title" className="text-xl font-semibold tracking-tight text-foreground">
          {copy.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
            <CardDescription>{copy.clicks}</CardDescription>
            <MousePointerClick className="size-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent><p className="text-2xl font-semibold tabular-nums">{formatter.format(data.clicks)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
            <CardDescription>{copy.signups}</CardDescription>
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{formatter.format(data.signups)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatter.format(data.verifiedSignups)} {copy.verified.toLocaleLowerCase(language === 'tr' ? 'tr-TR' : 'en-US')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
            <CardDescription>{copy.paid}</CardDescription>
            <UserRoundCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent><p className="text-2xl font-semibold tabular-nums">{formatter.format(data.paidCustomers)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
            <CardDescription>{copy.conversion}</CardDescription>
            <WalletCards className="size-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{copy.clickToSignup}</span>
              <span className="font-semibold tabular-nums">{percentFormatter.format(clickToSignup)}%</span>
            </div>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{copy.signupToPaid}</span>
              <span className="font-semibold tabular-nums">{percentFormatter.format(signupToPaid)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">{copy.link}</CardTitle>
            <CardDescription className="mt-1 break-all font-mono">{referralUrl}</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={handleCopyLink} className="shrink-0 gap-2">
            {copyState === 'copied' ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copyState === 'copied' ? copy.copied : copy.copy}
          </Button>
        </CardHeader>
        {copyState === 'failed' && <CardContent className="pt-0"><p role="status" className="text-sm text-destructive">{copy.copyFailed}</p></CardContent>}
      </Card>

      {payoutsEnabled && (
        <ReferralPayoutControls
          enabled={payoutsEnabled}
          cashEnabled={cashPayoutsEnabled}
          data={payoutData}
          variant="dashboard"
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{copy.customers}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.noCustomers}</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.customers.map((customer) => (
                <li key={`${customer.maskedEmail}-${customer.createdAt}`} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <span className="break-all text-sm font-medium text-foreground">
                    {customer.accountDeleted ? copy.deletedAccount : customer.maskedEmail}
                  </span>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_VARIANT[customer.status]}>{copy.statuses[customer.status]}</Badge>
                      {customer.accountDeleted && <Badge variant="outline">{copy.deleted}</Badge>}
                    </div>
                    <time dateTime={customer.createdAt} className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'medium' }).format(new Date(customer.createdAt))}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
    {!sectionVisible && (
      <a
        href="#satis-ortakligi"
        onClick={(event) => {
          event.preventDefault()
          const section = sectionRef.current
          if (!section) return
          const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
        }}
        className="fixed bottom-4 left-4 z-40 inline-flex min-h-10 items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-lg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={copy.jumpToSection}
      >
        {copy.jumpToSection}
      </a>
    )}
    </>
  )
}

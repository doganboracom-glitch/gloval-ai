'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Copy } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { LinkButton } from '@/components/link-button'
import { ReferralJumpLink } from '@/components/dashboard/referral-jump-link'
import { ReferralMetrics } from '@/components/referral-metrics'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatReferralTry } from '@/lib/referrals/payout-core'
import type { ReferralDashboardData, ReferralPayoutPanelData } from '@/lib/referrals/partner-types'

const SECTION_ID = 'satis-ortakligi'

type DashboardCopy = {
  title: string
  details: string
  invitation: string
  join: string
  link: string
  copy: string
  copied: string
  copyFailed: string
  balance: string
  balanceUnavailable: string
  jumpToSection: string
  jumpToSectionLabel: string
}

const COPY = {
  tr: {
    title: 'Satış ortaklığı',
    details: 'Ayrıntı',
    invitation: 'Satış ortaklığı programına katılın, size özel bağlantınızla yönlendirme sonuçlarını takip edin.',
    join: 'Ortak ol',
    link: 'Yönlendirme bağlantınız',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    copyFailed: 'Bağlantı kopyalanamadı.',
    balance: 'Hesapta görünen',
    balanceUnavailable: 'Şu anda görüntülenemiyor',
    jumpToSection: '↓ Satış ortaklığı',
    jumpToSectionLabel: 'Satış ortaklığı bölümüne git',
  },
  en: {
    title: 'Referral partnership',
    details: 'Details',
    invitation: 'Join the referral program and track results from your own link.',
    join: 'Become a partner',
    link: 'Your referral link',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Could not copy the link.',
    balance: 'Balance on account',
    balanceUnavailable: 'Unavailable right now',
    jumpToSection: '↓ Referral partnership',
    jumpToSectionLabel: 'Go to the referral partnership section',
  },
} satisfies Record<'tr' | 'en', DashboardCopy>

export function ReferralDashboardPanel({
  data,
  enabled = true,
  hasPartner = Boolean(data),
  payoutData = null,
  payoutsEnabled = false,
}: {
  data: ReferralDashboardData | null
  enabled?: boolean
  hasPartner?: boolean
  payoutData?: ReferralPayoutPanelData | null
  payoutsEnabled?: boolean
}) {
  const { lang } = useLanguage()
  const language = lang === 'tr' ? 'tr' : 'en'
  const copy = COPY[language]
  const sectionRef = useRef<HTMLElement>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  if (!enabled || (!data && hasPartner)) return null

  const referralUrl = data ? `https://gloval.ai/?ref=${data.referralCode}` : ''

  async function handleCopyLink() {
    if (!referralUrl) return
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <>
      <section
        ref={sectionRef}
        id={SECTION_ID}
        aria-labelledby="referral-dashboard-title"
        className="mt-6 scroll-mt-24"
      >
        <Card className="border-border/80 bg-card/70">
          <CardHeader className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="referral-dashboard-title" className="text-base font-semibold leading-6 tracking-tight text-foreground">
                {copy.title}
              </h2>
              <Link
                href="/settings#satis-ortakligi"
                className="shrink-0 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {copy.details}
              </Link>
            </div>
          </CardHeader>
          {data ? (
            <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
              <div role="group" aria-label={copy.link} className="flex min-w-0 items-center gap-2">
                <code
                  title={referralUrl}
                  className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-sm leading-5 text-foreground"
                >
                  {referralUrl}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="shrink-0 gap-1.5"
                >
                  {copyState === 'copied' ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                  {copyState === 'copied' ? copy.copied : copy.copy}
                </Button>
              </div>
              {copyState === 'failed' && (
                <p role="status" aria-live="polite" className="text-sm text-destructive">
                  {copy.copyFailed}
                </p>
              )}
              {copyState === 'copied' && (
                <span role="status" aria-live="polite" className="sr-only">
                  {copy.copied}
                </span>
              )}
              <ReferralMetrics data={data} />
              {payoutsEnabled && (
                <div
                  role="group"
                  aria-label={copy.balance}
                  className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm"
                >
                  <span className="text-sm text-muted-foreground">{copy.balance}</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {payoutData?.state
                      ? formatReferralTry(payoutData.state.totalCents, language)
                      : copy.balanceUnavailable}
                  </span>
                </div>
              )}
            </CardContent>
          ) : (
            <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:pb-5">
              <p className="text-sm leading-6 text-muted-foreground">{copy.invitation}</p>
              <LinkButton href="/settings#satis-ortakligi" variant="brand" size="sm" className="shrink-0">
                {copy.join}
              </LinkButton>
            </CardContent>
          )}
        </Card>
      </section>
      <ReferralJumpLink
        sectionRef={sectionRef}
        sectionId={SECTION_ID}
        label={copy.jumpToSection}
        ariaLabel={copy.jumpToSectionLabel}
      />
    </>
  )
}

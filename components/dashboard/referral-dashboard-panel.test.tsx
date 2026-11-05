import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReferralPayoutPanelData } from '@/lib/referrals/partner-types'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ lang: 'tr' }))
vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: state.lang }) }))

import { ReferralDashboardPanel } from '@/components/dashboard/referral-dashboard-panel'

const dashboardData = {
  referralCode: 'PARTNER1234',
  clicks: 100,
  signups: 10,
  verifiedSignups: 8,
  paidCustomers: 2,
  customers: [
    { maskedEmail: 'm***@gmail.com', accountDeleted: false, status: 'paid' as const, createdAt: '2026-11-03T12:00:00.000Z' },
  ],
}

const payoutData: ReferralPayoutPanelData = {
  unavailable: false,
  state: {
    partnerStatus: 'active',
    taxStatus: 'individual',
    taxVerified: true,
    hasIban: true,
    pendingCents: 0,
    availableCents: 12_345,
    totalCents: 12_345,
    convertibleCents: 12_345,
    maxCreditCents: 12_345,
    maxCashCents: 12_345,
    hasDebtBucket: false,
    partialPayoutsAvailable: false,
    requestedCents: 0,
    convertedCents: 0,
    paidCents: 0,
    hasOpenCashRequest: false,
  },
}

describe('referral dashboard panel', () => {
  it('shows a short invitation only for non-partners while the feature is enabled', () => {
    state.lang = 'tr'
    const invite = renderToStaticMarkup(createElement(ReferralDashboardPanel, {
      data: null,
      enabled: true,
      hasPartner: false,
    }))

    expect(invite).toContain('Satış ortaklığı')
    expect(invite).toContain('Ortak ol')
    expect(invite).toContain('href="/settings#satis-ortakligi"')
    expect(invite).not.toContain('Tıklama')
    expect(renderToStaticMarkup(createElement(ReferralDashboardPanel, {
      data: null,
      enabled: true,
      hasPartner: true,
    }))).toBe('')
    expect(renderToStaticMarkup(createElement(ReferralDashboardPanel, {
      data: null,
      enabled: false,
    }))).toBe('')
  })

  it('renders one compact stats card and a one-line balance summary without payout details or customer rows', () => {
    state.lang = 'en'
    const html = renderToStaticMarkup(createElement(ReferralDashboardPanel, {
      data: dashboardData,
      enabled: true,
      hasPartner: true,
      payoutData,
      payoutsEnabled: true,
    }))

    expect(html).toContain('https://gloval.ai/?ref=PARTNER1234')
    expect(html).toContain('href="/settings#satis-ortakligi"')
    expect(html).toContain('Clicks')
    expect(html).toContain('Signups')
    expect(html).toContain('Paid customers')
    expect(html).toContain('Conversion rate')
    expect(html).toContain('2%')
    expect(html).toContain('Balance on account')
    expect(html).toContain('123.45')
    expect(html).not.toContain('m***@gmail.com')
    expect(html).not.toContain('Request payout')
    expect(html).not.toContain('IBAN')
    expect(html).not.toContain('Commission payments have not started yet')
    expect(html).not.toContain('Click → signup')
    expect(html.match(/<h2/g) ?? []).toHaveLength(1)
    expect(html).toContain('aria-labelledby="referral-dashboard-title"')
  })

  it('uses the same four metric labels in Turkish and omits the balance when payouts are disabled', () => {
    state.lang = 'tr'
    const html = renderToStaticMarkup(createElement(ReferralDashboardPanel, {
      data: dashboardData,
      enabled: true,
      hasPartner: true,
      payoutsEnabled: false,
    }))

    expect(html).toContain('Tıklama')
    expect(html).toContain('Kayıt')
    expect(html).toContain('Ücretli müşteri')
    expect(html).toContain('Dönüşüm yüzdesi')
    expect(html).toContain('2%')
    expect(html).not.toContain('Hesapta görünen')
    expect(html).not.toContain('₺')
    expect(html).not.toContain('TRY')
    expect(html).not.toContain('TL')
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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

describe('referral dashboard panel', () => {
  it('renders nothing when there is no active partnership', () => {
    expect(renderToStaticMarkup(createElement(ReferralDashboardPanel, { data: null }))).toBe('')
  })

  it('keeps the referral section named and addressable without a visible heading or description in both languages', () => {
    state.lang = 'tr'
    const turkish = renderToStaticMarkup(createElement(ReferralDashboardPanel, { data: dashboardData }))
    expect(turkish).toContain('id="satis-ortakligi"')
    expect(turkish).toContain('aria-label="Satış ortaklığı"')
    expect(turkish).toContain('scroll-mt-24')
    expect(turkish).not.toContain('<h2')
    expect(turkish).not.toContain('Yönlendirme bağlantınızın tıklama ve kayıt sonuçları.')

    state.lang = 'en'
    const english = renderToStaticMarkup(createElement(ReferralDashboardPanel, { data: dashboardData }))
    expect(english).toContain('id="satis-ortakligi"')
    expect(english).toContain('aria-label="Referral partnership"')
    expect(english).not.toContain('<h2')
    expect(english).not.toContain('Clicks and signup outcomes for your referral link.')
  })

  it('shows referral metrics, conversions, masked customers, and no payment controls', () => {
    state.lang = 'en'
    const html = renderToStaticMarkup(createElement(ReferralDashboardPanel, { data: dashboardData }))

    expect(html).toContain('https://gloval.ai/?ref=PARTNER1234')
    expect(html).toContain('Click → signup')
    expect(html).toContain('10%')
    expect(html).toContain('20%')
    expect(html).toContain('m***@gmail.com')
    expect(html).not.toContain('maria@gmail.com')
    expect(html).not.toContain('Commission payments have not started yet')
    expect(html).not.toContain('Request payout')
    expect(html).not.toMatch(/(?:₺|\\bTRY\\b|\\$|1,000)/u)
    expect(html).not.toContain('IBAN')
    expect(html).not.toContain('paymentPageUrl')
  })

  it('hides payout copy when the payout flag is disabled', () => {
    state.lang = 'tr'
    const html = renderToStaticMarkup(createElement(ReferralDashboardPanel, { data: dashboardData }))

    expect(html).not.toContain('Komisyon ödemeleri henüz başlamadı')
    expect(html).not.toContain('Ödeme iste')
    expect(html).not.toMatch(/(?:₺|\\bTRY\\b|\\bTL\\b|\\$|1\\.000)/u)
  })

  it('labels deleted members without showing a masked email placeholder in English and Turkish', () => {
    const deletedData = {
      ...dashboardData,
      customers: [{ maskedEmail: '', accountDeleted: true, status: 'verified' as const, createdAt: '2026-11-03T12:00:00.000Z' }],
    }

    state.lang = 'en'
    const english = renderToStaticMarkup(createElement(ReferralDashboardPanel, { data: deletedData }))
    expect(english).toContain('Deleted account')
    expect(english).toContain('Deleted by member')
    expect(english).not.toContain('***')

    state.lang = 'tr'
    const turkish = renderToStaticMarkup(createElement(ReferralDashboardPanel, { data: deletedData }))
    expect(turkish).toContain('Silinmiş hesap')
    expect(turkish).toContain('Üye tarafından silindi')
    expect(turkish).not.toContain('***')
  })
})

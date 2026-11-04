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
    { maskedEmail: 'm***@gmail.com', status: 'paid' as const, createdAt: '2026-11-03T12:00:00.000Z' },
  ],
}

describe('referral dashboard panel', () => {
  it('renders nothing when there is no active partnership', () => {
    expect(renderToStaticMarkup(createElement(ReferralDashboardPanel, { data: null }))).toBe('')
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
    expect(html).toContain('Commission and payment: coming soon')
    expect(html).not.toContain('IBAN')
    expect(html).not.toContain('paymentPageUrl')
  })
})

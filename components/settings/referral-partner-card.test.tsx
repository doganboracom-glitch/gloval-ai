import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ lang: 'tr' }))
vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: state.lang }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/referrals/partner-actions', () => ({
  activateReferralPartner: vi.fn(),
  closeReferralPartner: vi.fn(),
}))

import { ReferralPartnerCard } from '@/components/settings/referral-partner-card'

afterEach(() => {
  state.lang = 'tr'
})

describe('referral partner settings card', () => {
  it('renders no referral menu or card while the feature flag is off', () => {
    const html = renderToStaticMarkup(createElement(ReferralPartnerCard, { enabled: false, partner: null }))
    expect(html).toBe('')
    expect(html).not.toContain('Satış Ortaklığı')
    expect(html).not.toContain('Referral Partner')
  })

  it('shows the active link and only the IBAN last four digits', () => {
    state.lang = 'en'
    const html = renderToStaticMarkup(createElement(ReferralPartnerCard, {
      enabled: true,
      partner: { referralCode: 'PARTNER1234', status: 'active', ibanLast4: '4321' },
    }))

    expect(html).toContain('https://gloval.ai/?ref=PARTNER1234')
    expect(html).toContain('4321')
    expect(html).not.toContain('TR123456789012345678901234')
    expect(html).toContain('Close partnership')
  })

  it('places a scrollable terms box before the required acceptance checkbox', () => {
    const html = renderToStaticMarkup(createElement(ReferralPartnerCard, { enabled: true, partner: null }))
    const termsPosition = html.indexOf('aria-label="Satış ortaklığı programı şartları"')
    const checkboxPosition = html.indexOf('id="referral-terms-accepted"')

    expect(termsPosition).toBeGreaterThanOrEqual(0)
    expect(checkboxPosition).toBeGreaterThan(termsPosition)
    expect(html).toContain('overflow-y-auto')
    expect(html).toContain('Şartların tamamını aç')
    expect(html).toContain('Türkiye IBAN')
  })
})

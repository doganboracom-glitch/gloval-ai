import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ lang: 'tr', refresh: vi.fn() }))

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ lang: state.lang }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: state.refresh }),
}))
vi.mock('@/lib/referrals/admin-actions', () => ({
  getReferralPartnerHistory: vi.fn(),
  searchReferralPartners: vi.fn(),
  updateReferralPartnerStatus: vi.fn(),
}))

import { ReferralPartnersAdminView } from './referral-partners-admin-view'

const partners = [
  {
    partnerId: '22222222-2222-4222-8222-222222222222',
    referralCode: 'RFLQ8M2K9N3P',
    maskedEmail: 'm***@example.test',
    status: 'active' as const,
    activatedAt: '2026-11-03T12:00:00.000Z',
    lastStatusChangedAt: '2026-11-03T12:00:00.000Z',
    ibanLast4: '4821',
    clicks: 120,
    signups: 8,
    verifiedSignups: 6,
    paidCustomers: 2,
  },
]

describe('ReferralPartnersAdminView', () => {
  beforeEach(() => {
    state.lang = 'tr'
  })

  it('renders Turkish labels and only masked email', () => {
    const html = renderToStaticMarkup(<ReferralPartnersAdminView partners={partners} />)

    expect(html).toContain('Satış ortakları')
    expect(html).toContain('Yönlendirme kodu')
    expect(html).toContain('m***@example.test')
    expect(html).not.toContain('member@example.test')
    expect(html).toContain('4821')
    expect(html).toContain('Dönüşüm')
    expect(html).not.toMatch(/\bTRY\b|₺/iu)
  })

  it('renders English labels and localized counts', () => {
    state.lang = 'en'
    const html = renderToStaticMarkup(<ReferralPartnersAdminView partners={partners} />)

    expect(html).toContain('Referral partners')
    expect(html).toContain('Referral code')
    expect(html).toContain('Clicks')
    expect(html).toContain('Signups')
    expect(html).toContain('Verified signups')
    expect(html).toContain('Paid customers')
    expect(html).not.toMatch(/\bTRY\b|₺/iu)
  })

  it('exposes scroll targets for the partner, payout, and reversal sections', () => {
    const html = renderToStaticMarkup(
      <ReferralPartnersAdminView partners={partners} payoutsEnabled />,
    )

    expect(html).toContain('id="partners"')
    expect(html).toContain('id="payouts"')
    expect(html).toContain('id="reversals"')
    expect(html).toContain('scroll-mt-24')
  })
})

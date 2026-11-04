import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const localeState = vi.hoisted(() => ({ lang: 'tr' }))

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ lang: localeState.lang }),
}))

import { ReferralPartnersAdminView } from './referral-partners-admin-view'

const partners = [
  {
    referralCode: 'RFLQ8M2K9N3P',
    maskedEmail: 'm***@example.test',
    status: 'active' as const,
    activatedAt: '2026-11-03T12:00:00.000Z',
    ibanLast4: '4821',
    clicks: 120,
    signups: 8,
  },
]

describe('ReferralPartnersAdminView', () => {
  beforeEach(() => {
    localeState.lang = 'tr'
  })

  it('renders Turkish labels and only masked email', () => {
    const html = renderToStaticMarkup(<ReferralPartnersAdminView partners={partners} />)

    expect(html).toContain('Satış ortakları')
    expect(html).toContain('Yönlendirme kodu')
    expect(html).toContain('m***@example.test')
    expect(html).not.toContain('member@example.test')
    expect(html).toContain('4821')
    expect(html).not.toMatch(/commission|payout|TRY|₺|%/iu)
  })

  it('renders English labels and localized counts', () => {
    localeState.lang = 'en'
    const html = renderToStaticMarkup(<ReferralPartnersAdminView partners={partners} />)

    expect(html).toContain('Referral partners')
    expect(html).toContain('Referral code')
    expect(html).toContain('Clicks')
    expect(html).toContain('Signups')
    expect(html).not.toMatch(/commission|payout|TRY|₺|%/iu)
  })
})

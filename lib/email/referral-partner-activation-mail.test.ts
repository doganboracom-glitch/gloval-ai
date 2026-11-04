import { describe, expect, it } from 'vitest'
import { buildReferralPartnerActivationAdminEmail } from './referral-partner-activation-mail'

describe('buildReferralPartnerActivationAdminEmail', () => {
  it('includes only the referral code and activation date in Turkish and English', () => {
    for (const lang of ['tr', 'en'] as const) {
      const email = buildReferralPartnerActivationAdminEmail({
        lang,
        referralCode: 'PARTNER0123',
        activatedAt: '2026-11-04T12:30:00.000Z',
      })

      expect(email.subject).toContain(lang === 'tr' ? 'satış ortağı' : 'referral partner')
      expect(email.html).toContain('PARTNER0123')
      expect(email.text).toContain('PARTNER0123')
      expect(email.html.toLowerCase()).not.toContain('iban')
      expect(email.html).not.toContain('@')
    }
  })

  it('escapes referral codes before inserting them into the email body', () => {
    const email = buildReferralPartnerActivationAdminEmail({
      lang: 'en',
      referralCode: '<script>alert(1)</script>',
      activatedAt: '2026-11-04T12:30:00.000Z',
    })

    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })
})

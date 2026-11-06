import { describe, expect, it } from 'vitest'
import { buildReferralPartnerWelcomeEmail } from './referral-partner-welcome-mail'

describe('referral partner welcome email payout terms', () => {
  it('explains no-minimum credit conversion and the separate IBAN minimum', () => {
    const turkish = buildReferralPartnerWelcomeEmail({
      lang: 'tr',
      referralCode: 'PARTNER1234',
      cashPayoutsEnabled: true,
    })
    const english = buildReferralPartnerWelcomeEmail({
      lang: 'en',
      referralCode: 'PARTNER1234',
      cashPayoutsEnabled: true,
    })

    expect(turkish.text).toContain('Bekleyen ve kullanılabilir komisyonlarınızın tamamını veya uygun bir kısmını, minimum dönüşüm tutarı olmadan AI kredisine çevirebilirsiniz.')
    expect(turkish.text).toContain('IBAN nakit ödemesi için 14 günlük bekleme tamamlanmalı ve kullanılabilir bakiye en az 1.000 TL olmalıdır.')
    expect(english.text).toContain('All or an eligible portion of your pending and available commissions can be converted to AI credits without a minimum conversion amount.')
    expect(english.text).toContain('An IBAN cash payout requires the 14-day hold to end and at least TRY 1,000 in available balance.')
  })

  it('keeps the cash threshold clear while qualifying disabled cash payouts', () => {
    const email = buildReferralPartnerWelcomeEmail({
      lang: 'tr',
      referralCode: 'PARTNER1234',
      cashPayoutsEnabled: false,
    })

    expect(email.text).toContain('minimum dönüşüm tutarı olmadan')
    expect(email.text).toContain('IBAN nakit ödemesi etkinleştirildiğinde')
    expect(email.text).toContain('1.000 TL')
    expect(email.text).not.toContain('IBAN nakit ödemesi için 14 günlük bekleme')
  })
})

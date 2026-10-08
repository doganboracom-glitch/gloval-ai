import { describe, expect, it } from 'vitest'
import {
  buildCreditNotice,
  creditNoticeDedupeKey,
  creditNoticeText,
  parseCreditNoticeAmount,
  CREDIT_NOTICE_TYPE_FIRST,
  CREDIT_NOTICE_TYPE_PERIOD,
} from './credit-notice'

describe('credit notice', () => {
  it('renders Turkish and English text, with a first-period variant', () => {
    expect(creditNoticeText('tr', 1500, false)).toContain('yapay zeka işlemi eklendi')
    expect(creditNoticeText('tr', 1500, true)).toContain('Aboneliğiniz başladı')
    expect(creditNoticeText('en', 1500, false)).toBe('1,500 AI actions were added to your account')
    expect(creditNoticeText('en', 1500, true)).toContain('subscription has started')
  })

  it('stores a plain integer in the body so the amount can be read back', () => {
    for (const firstPeriod of [true, false]) {
      const row = buildCreditNotice({ amount: 12500, firstPeriod })
      expect(row.type).toBe(firstPeriod ? CREDIT_NOTICE_TYPE_FIRST : CREDIT_NOTICE_TYPE_PERIOD)
      expect(parseCreditNoticeAmount(row.body)).toBe(12500)
    }
  })

  it('rejects bodies without a positive amount', () => {
    expect(parseCreditNoticeAmount(null)).toBeNull()
    expect(parseCreditNoticeAmount('merhaba')).toBeNull()
    expect(parseCreditNoticeAmount('0 işlem')).toBeNull()
  })

  it('builds one dedupe key per subscription and period', () => {
    const a = creditNoticeDedupeKey('sub1', '2026-01-01T00:00:00.000Z')
    expect(a).toBe(creditNoticeDedupeKey('sub1', '2026-01-01T00:00:00.000Z'))
    expect(a).not.toBe(creditNoticeDedupeKey('sub1', '2026-02-01T00:00:00.000Z'))
    expect(a).not.toBe(creditNoticeDedupeKey('sub2', '2026-01-01T00:00:00.000Z'))
  })
})

import { describe, expect, it } from 'vitest'
import { dailyBudgetToMinor, validateLandingUrl, validateMetaPlanContent } from '@/lib/ads/meta-publish-plan'

const valid = {
  name: 'Yaz kampanyası',
  landingUrl: 'https://example.com/urun',
  primaryText: 'Yeni sezon ürünlerimizi keşfedin.',
  headline: 'Yeni sezon',
  description: '',
  cta: 'SHOP_NOW',
  countries: ['TR'],
  ageMin: 18,
  ageMax: 65,
  gender: 'all',
  dailyBudget: '250.50',
  endDate: null,
  imagePath: null,
  specialTopic: 'none',
}

describe('dailyBudgetToMinor', () => {
  it('converts decimal strings exactly with no float drift', () => {
    expect(dailyBudgetToMinor('250.5', 'TRY')).toEqual({ ok: true, minor: 25050 })
    expect(dailyBudgetToMinor('1,10', 'USD')).toEqual({ ok: true, minor: 110 })
    expect(dailyBudgetToMinor(0.3, 'EUR')).toEqual({ ok: true, minor: 30 })
  })

  it('uses whole units for zero-decimal currencies', () => {
    expect(dailyBudgetToMinor('500', 'JPY')).toEqual({ ok: true, minor: 500 })
    expect(dailyBudgetToMinor('500.5', 'JPY')).toEqual({ ok: false, error: 'too_many_decimals' })
  })

  it('rejects unsupported currency, junk and zero', () => {
    expect(dailyBudgetToMinor('10', 'XXX')).toEqual({ ok: false, error: 'currency_unsupported' })
    expect(dailyBudgetToMinor('10', null)).toEqual({ ok: false, error: 'currency_unsupported' })
    expect(dailyBudgetToMinor('abc', 'TRY')).toEqual({ ok: false, error: 'invalid_amount' })
    expect(dailyBudgetToMinor('-5', 'TRY')).toEqual({ ok: false, error: 'invalid_amount' })
    expect(dailyBudgetToMinor('0', 'TRY')).toEqual({ ok: false, error: 'amount_too_small' })
    expect(dailyBudgetToMinor('1.999', 'TRY')).toEqual({ ok: false, error: 'too_many_decimals' })
  })
})

describe('validateLandingUrl', () => {
  it('accepts a public https domain and strips the fragment', () => {
    expect(validateLandingUrl('https://example.com/a#x')).toEqual({ ok: true, url: 'https://example.com/a' })
  })

  it.each([
    'http://example.com',
    'https://user:pw@example.com',
    'https://example.com:8443',
    'https://127.0.0.1',
    'https://[::1]',
    'https://localhost',
    'not a url',
    '',
  ])('rejects %s', (value) => {
    expect(validateLandingUrl(value).ok).toBe(false)
  })
})

describe('validateMetaPlanContent', () => {
  const now = new Date('2026-07-10T12:00:00Z')

  it('accepts a complete plan and returns the budget in minor units', () => {
    const result = validateMetaPlanContent(valid, { currency: 'TRY', now })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.dailyBudgetMinor).toBe(25050)
  })

  it('rejects special ad categories', () => {
    const result = validateMetaPlanContent({ ...valid, specialTopic: 'credit' }, { currency: 'TRY', now })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.specialTopic).toBeTruthy()
  })

  it('rejects a past end date and bad age ranges', () => {
    const result = validateMetaPlanContent({ ...valid, endDate: '2026-07-09', ageMin: 30, ageMax: 20 }, { currency: 'TRY', now })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.endDate).toBeTruthy()
      expect(result.errors.ageMax).toBeTruthy()
    }
  })

  it('requires the image only when asked', () => {
    expect(validateMetaPlanContent(valid, { currency: 'TRY', now }).ok).toBe(true)
    const result = validateMetaPlanContent(valid, { currency: 'TRY', now, requireImage: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.imagePath).toBeTruthy()
  })

  it('rejects unknown countries and CTAs', () => {
    const result = validateMetaPlanContent({ ...valid, countries: ['ZZ'], cta: 'BUY_NOW' }, { currency: 'TRY', now })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.countries).toBeTruthy()
      expect(result.errors.cta).toBeTruthy()
    }
  })
})

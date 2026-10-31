import { describe, expect, it } from 'vitest'
import { dictionary } from '@/lib/i18n'
import { SUPPORTED_LOCALES } from '@/lib/locale-registry'
import { ADS_SCAN_ERROR_STATUS } from '@/lib/ads/public-errors'
import type { ClientScanError } from '@/lib/ads/scan-client'
import { describeScanError } from '@/lib/ads/scan-messages'

const ALL_CODES: ClientScanError['code'][] = [
  ...(Object.keys(ADS_SCAN_ERROR_STATUS) as Array<keyof typeof ADS_SCAN_ERROR_STATUS>),
  'network',
  'duplicate_lost',
]

describe('describeScanError', () => {
  for (const lang of ['tr', 'en'] as const) {
    const copy = dictionary[lang].ads

    it(`${lang}: every code has a non-empty message without unfilled placeholders`, () => {
      for (const code of ALL_CODES) {
        const view = describeScanError({ code } as ClientScanError, copy)
        expect(view.message.length, code).toBeGreaterThan(10)
        expect(view.message, code).not.toMatch(/\{(n|cost)\}/)
      }
    })

    it(`${lang}: fills the credit cost and balance`, () => {
      const view = describeScanError({ code: 'credits_required', balance: 1 }, copy)
      expect(view.message).toContain('2')
      expect(view.message).toContain('1')
      expect(view.action).toBe('credits')
    })

    it(`${lang}: says the attempt was counted only when it was`, () => {
      const kept = describeScanError({ code: 'policy_blocked' }, copy).message
      const used = describeScanError({ code: 'policy_blocked', consumed: true }, copy).message
      expect(used.startsWith(kept)).toBe(true)
      expect(used.length).toBeGreaterThan(kept.length)
    })
  }

  it.each(SUPPORTED_LOCALES)('%s localizes the daily limit and adult-beta policy notices', (lang) => {
    const copy = dictionary[lang].ads
    const limit = describeScanError({ code: 'policy_attempt_limit' }, copy)
    const adultNotCounted = describeScanError(
      { code: 'policy_blocked', consumed: false, messageKey: 'errPolicyBlockedAdultNotConsumed' },
      copy,
    )
    const adultCounted = describeScanError(
      { code: 'policy_blocked', consumed: false, messageKey: 'errPolicyBlockedAdultConsumed' },
      copy,
    )

    expect(limit.message).toBe(copy.errPolicyAttemptLimit)
    expect(limit.message.length).toBeGreaterThan(10)
    expect(adultNotCounted.message).toBe(copy.errPolicyBlockedAdultNotConsumed)
    expect(adultCounted.message).toBe(copy.errPolicyBlockedAdultConsumed)
    expect(adultNotCounted.action).toBe('none')
    if (lang !== 'en') expect(limit.message).not.toBe(dictionary.en.ads.errPolicyAttemptLimit)
  })

  it('the unreachable message never names a cause such as robots, private network or noindex as a reason', () => {
    const tr = describeScanError({ code: 'unreachable' }, dictionary.tr.ads).message
    expect(tr).toContain('robots.txt')
    expect(tr).toContain('GlovalAdsBot')
    expect(tr).not.toMatch(/noindex|özel ağ|iç ağ/i)
    expect(tr).toContain('hakkından düşülmedi')
  })

  it('shows the Turkish adult-beta notice for the deterministic Lilashop block', () => {
    expect(
      describeScanError(
        { code: 'policy_blocked', consumed: false, messageKey: 'errPolicyBlockedAdultNotConsumed' },
        dictionary.tr.ads,
      ),
    ).toEqual({
      message:
        'GLOVAL Ads beta sürümünde bu kategori (yetişkin ürünleri) henüz desteklenmiyor. Bu deneme günlük engelli kategori sınırına sayılmadı ve tarama hakkın veya kredin kullanılmadı.',
      action: 'none',
    })
  })

  it('shows the exact Turkish daily policy-attempt limit without a retry action', () => {
    expect(describeScanError({ code: 'policy_attempt_limit' }, dictionary.tr.ads)).toEqual({
      message: 'Bugün desteklenmeyen kategori denemesi sınırına ulaştın, yarın tekrar dene',
      action: 'none',
    })
  })

  it('sends visitors who ran out to sign in and signed-in users without credits to billing', () => {
    expect(describeScanError({ code: 'login_required' }, dictionary.tr.ads).action).toBe('login')
    expect(describeScanError({ code: 'anon_capacity' }, dictionary.tr.ads).action).toBe('login')
    expect(describeScanError({ code: 'credits_required' }, dictionary.tr.ads).action).toBe('credits')
  })

  it('tr and en define the same ads keys', () => {
    expect(Object.keys(dictionary.en.ads).sort()).toEqual(Object.keys(dictionary.tr.ads).sort())
  })
})

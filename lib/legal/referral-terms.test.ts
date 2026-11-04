import { afterEach, describe, expect, it, vi } from 'vitest'
import { REFERRAL_TERMS, REFERRAL_TERMS_VERSION } from '@/lib/referrals/terms'

const REFERRAL_SLUG = 'satis-ortakligi-sartlari'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('referral partner terms', () => {
  it('uses the accepted version and includes the agreed commission and eligibility terms', () => {
    expect(REFERRAL_TERMS_VERSION).toBe('v1.0')
    expect(REFERRAL_TERMS.tr.sections[0].paragraphs.join(' ')).toContain('%20')
    expect(REFERRAL_TERMS.tr.sections[0].paragraphs.join(' ')).toContain('KDV hariç')
    expect(REFERRAL_TERMS.tr.sections[0].paragraphs.join(' ')).toContain('14 günlük')
    expect(REFERRAL_TERMS.tr.sections[0].paragraphs.join(' ')).toContain('1.000 TL')
    expect(REFERRAL_TERMS.tr.sections[2].paragraphs.join(' ')).toContain('gloval')
  })

  it('adds only the referral terms slug while the feature flag is enabled', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '0')
    vi.resetModules()
    const closedRegistry = await import('@/lib/legal/documents')
    const closedSlugs = [...closedRegistry.LEGAL_SLUGS]
    expect(closedSlugs).not.toContain(REFERRAL_SLUG)

    vi.stubEnv('REFERRAL_ENABLED', '1')
    vi.resetModules()
    const openRegistry = await import('@/lib/legal/documents')
    expect(openRegistry.LEGAL_SLUGS).toContain(REFERRAL_SLUG)
    expect(openRegistry.LEGAL_SLUGS.filter((slug) => slug !== REFERRAL_SLUG)).toEqual(closedSlugs)
    expect(openRegistry.REFERRAL_PARTNER_TERMS_DOC.tr.title).toBe(REFERRAL_TERMS.tr.title)
    expect(openRegistry.REFERRAL_PARTNER_TERMS_DOC.en.title).toBe(REFERRAL_TERMS.en.title)
  })
})

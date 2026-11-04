import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  REFERRAL_TERMS,
  REFERRAL_TERMS_UPDATED_AT,
  REFERRAL_TERMS_VERSION,
} from '@/lib/referrals/terms'

const REFERRAL_SLUG = 'satis-ortakligi-sartlari'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('referral partner terms', () => {
  it('uses the accepted version, neutral payment terms, and program eligibility rules', () => {
    const turkishTerms = REFERRAL_TERMS.tr.sections.flatMap((section) => section.paragraphs).join(' ')
    const englishTerms = REFERRAL_TERMS.en.sections.flatMap((section) => section.paragraphs).join(' ')

    expect(REFERRAL_TERMS_VERSION).toBe('v1.0')
    expect(turkishTerms).toContain('Ödeme koşulları ayrıca duyurulacaktır.')
    expect(englishTerms).toContain('Payment terms will be announced separately.')
    expect(turkishTerms).not.toMatch(/%\s*20|KDV hariç|14 günlük|1\.000\s*TL|komisyon hakkı doğmaz|garanti kazanç|taslak|hukuki onay bekliyor/iu)
    expect(englishTerms).not.toMatch(/20%|exclusive of VAT|14-day|TRY\s*1,000|commission is due|guaranteed-earnings|draft|legal approval pending/iu)
    expect(REFERRAL_TERMS_UPDATED_AT).toBe('2026-11-04')
    expect(REFERRAL_TERMS.tr.sections[2].paragraphs.join(' ')).toContain('gloval')
    expect(REFERRAL_TERMS.tr.sections.at(-1)?.paragraphs.join(' ')).toContain('sürüm v1.0')
    expect(REFERRAL_TERMS.tr.sections.at(-1)?.paragraphs.join(' ')).toContain('4 Kasım 2026')
    expect(REFERRAL_TERMS.en.sections.at(-1)?.paragraphs.join(' ')).toContain('version v1.0')
    expect(REFERRAL_TERMS.en.sections.at(-1)?.paragraphs.join(' ')).toContain('November 4, 2026')
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

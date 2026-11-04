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
  it('uses version v1.1 and explains commission, payout, tax, and privacy rules', () => {
    const turkishTerms = REFERRAL_TERMS.tr.sections.flatMap((section) => section.paragraphs).join(' ')
    const englishTerms = REFERRAL_TERMS.en.sections.flatMap((section) => section.paragraphs).join(' ')

    expect(REFERRAL_TERMS_VERSION).toBe('v1.1')
    expect(turkishTerms).toMatch(/ilk başarılı abonelik ödemesi.*%20.*KDV hariç/iu)
    expect(turkishTerms).toMatch(/14 gün.*iade edilir/iu)
    expect(turkishTerms).toMatch(/1\.000 TL.*AI kredisine.*1 kredi.*3 TL/iu)
    expect(turkishTerms).toMatch(/Şirket.*KDV.*fatura.*Bireysel.*fatura.*gider belgesi/iu)
    expect(turkishTerms).toMatch(/TCKN veya vergi numarası.*toplanmaz/iu)
    expect(turkishTerms).toMatch(/kötüye kullanım.*askıya alınabilir/iu)
    expect(englishTerms).toMatch(/first successful paid subscription charge.*20%.*excluding VAT/iu)
    expect(englishTerms).toMatch(/14 days.*refunded/iu)
    expect(englishTerms).toMatch(/TRY 1,000.*AI credit conversion.*one credit.*TRY 3/iu)
    expect(englishTerms).toMatch(/Company.*commission invoice including VAT.*No invoice is requested from individual.*expense document/iu)
    expect(englishTerms).toMatch(/national ID or tax identification numbers/iu)
    expect(turkishTerms).not.toMatch(/garanti gelir|garantili kazanç/iu)
    expect(englishTerms).not.toMatch(/guaranteed earnings/iu)
    expect(REFERRAL_TERMS_UPDATED_AT).toBe('2026-11-04')
    expect(REFERRAL_TERMS.tr.sections[2].paragraphs.join(' ')).toContain('gloval')
    expect(REFERRAL_TERMS.tr.sections.at(-1)?.paragraphs.join(' ')).toContain('sürüm v1.1')
    expect(REFERRAL_TERMS.tr.sections.at(-1)?.paragraphs.join(' ')).toContain('4 Kasım 2026')
    expect(REFERRAL_TERMS.en.sections.at(-1)?.paragraphs.join(' ')).toContain('version v1.1')
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

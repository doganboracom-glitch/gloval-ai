import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  REFERRAL_TERMS,
  REFERRAL_TERMS_UPDATED_AT,
  REFERRAL_TERMS_VERSION,
} from '@/lib/referrals/terms'

const REFERRAL_SLUG = 'satis-ortakligi-sartlari'
const TURKISH_CREDIT_CONVERSION_CLAUSE =
  'AI kredisine dönüştürmede minimum tutar yoktur; 1 kredi 3 TL değerindedir. Kredi adedi yukarı yuvarlanır ve aradaki en fazla 2,99 TL tutarındaki fark GLOVAL AI tarafından karşılanır. Bekleyen ve kullanılabilir komisyonların tamamı veya dönüştürülebilir bakiye sınırında daha düşük bir tutar, 14 günlük bekleme süresi dolmadan AI kredisine çevrilebilir. Negatif gelecek bakiye düzeltmesi varken yalnızca bakiyenin tamamı dönüştürülebilir.'
const ENGLISH_CREDIT_CONVERSION_CLAUSE =
  'AI credit conversion has no minimum amount. One credit is worth TRY 3; the credit count is rounded up and GLOVAL AI covers the difference, up to TRY 2.99. All pending and available commissions, or a smaller eligible amount up to the convertible balance, can be converted before the 14-day hold ends. A partial conversion is unavailable while a future-dated negative balance adjustment exists.'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('referral partner terms', () => {
  it('uses version v1.2 and explains commission, payout, tax, and privacy rules', () => {
    const turkishTerms = REFERRAL_TERMS.tr.sections.flatMap((section) => section.paragraphs).join(' ')
    const englishTerms = REFERRAL_TERMS.en.sections.flatMap((section) => section.paragraphs).join(' ')

    expect(REFERRAL_TERMS_VERSION).toBe('v1.2')
    expect(turkishTerms).toMatch(/ilk başarılı abonelik ödemesi.*%20.*KDV hariç/iu)
    expect(turkishTerms).toMatch(/14 gün.*iade edilir/iu)
    expect(turkishTerms).toMatch(/1\.000 TL.*AI kredisine.*1 kredi.*3 TL/iu)
    expect(turkishTerms).toContain('minimum tutar yoktur')
    expect(turkishTerms).not.toContain('Dönüşüm için en az 3 TL gerekir')
    expect(turkishTerms).toMatch(/en az 1\.000 TL kullanılabilir bakiye.*tamamı veya en az bu eşik kadar bir bölümü.*KDV dahil.*KDV üstüne ekle/iu)
    expect(turkishTerms).toMatch(/Şirket.*KDV.*fatura.*Bireysel.*fatura.*gider belgesi/iu)
    expect(turkishTerms).toMatch(/TCKN veya vergi numarası.*toplanmaz/iu)
    expect(turkishTerms).toMatch(/kötüye kullanım.*askıya alınabilir/iu)
    expect(englishTerms).toMatch(/first successful paid subscription charge.*20%.*excluding VAT/iu)
    expect(englishTerms).toMatch(/14 days.*refunded/iu)
    expect(englishTerms).toMatch(/TRY 1,000.*AI credit conversion.*one credit.*TRY 3/iu)
    expect(englishTerms).toContain('AI credit conversion has no minimum amount')
    expect(englishTerms).not.toContain('Conversion requires at least TRY 3')
    expect(englishTerms).toMatch(/at least TRY 1,000 in available balance.*all of it or a portion at least that minimum.*VAT included in the amount.*add VAT on top/iu)
    expect(englishTerms).toMatch(/Company, including sole proprietorships.*VAT included in the amount.*add VAT on top.*No invoice is requested from individual.*expense document/iu)
    expect(englishTerms).toMatch(/national ID or tax identification numbers/iu)
    expect(turkishTerms).not.toMatch(/garanti gelir|garantili kazanç/iu)
    expect(englishTerms).not.toMatch(/guaranteed earnings/iu)
    expect(REFERRAL_TERMS_UPDATED_AT).toBe('2026-11-06')
    expect(REFERRAL_TERMS.tr.sections[2].paragraphs.join(' ')).toContain('gloval')
    expect(REFERRAL_TERMS.tr.sections.at(-1)?.paragraphs.join(' ')).toContain('sürüm v1.2')
    expect(REFERRAL_TERMS.tr.sections.at(-1)?.paragraphs.join(' ')).toContain('6 Kasım 2026')
    expect(REFERRAL_TERMS.en.sections.at(-1)?.paragraphs.join(' ')).toContain('version v1.2')
    expect(REFERRAL_TERMS.en.sections.at(-1)?.paragraphs.join(' ')).toContain('November 6, 2026')
  })

  it('adds the exact Turkish and English credit-conversion clauses after cash payout terms', () => {
    expect(REFERRAL_TERMS.tr.sections[0].paragraphs[4]).toBe(TURKISH_CREDIT_CONVERSION_CLAUSE)
    expect(REFERRAL_TERMS.en.sections[0].paragraphs[4]).toBe(ENGLISH_CREDIT_CONVERSION_CLAUSE)
    expect(REFERRAL_TERMS_VERSION).toBe('v1.2')
    expect(REFERRAL_TERMS_UPDATED_AT).toBe('2026-11-06')
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

import { afterEach, describe, expect, it, vi } from 'vitest'

type Block =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'link'; href: string; label: string; external?: boolean }
type Section = { heading: string; blocks: Block[] }

async function load(phone = '') {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_COMPANY_PHONE', phone)
  const company = await import('@/lib/legal/company')
  const docs = await import('@/lib/legal/documents')
  return { COMPANY: company.COMPANY, LEGAL_LAST_UPDATED: company.LEGAL_LAST_UPDATED, docs }
}

function flatten(section: Section): string[] {
  return section.blocks.flatMap((b) => (b.type === 'p' ? [b.text] : b.type === 'list' ? b.items : [b.label]))
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Kullanım Koşulları — Hizmet Sağlayıcı bölümü', () => {
  it('belgenin en başında, tanımlardan (1. madde) önce yer alır — tr ve en', async () => {
    const { docs } = await load()
    const terms = docs.getLegalDoc('kullanim-kosullari')!
    expect(terms.tr.sections[0].heading).toBe('Hizmet Sağlayıcı')
    expect(terms.en.sections[0].heading).toBe('Service Provider')
    expect(terms.tr.sections[1].heading).toBe('1. Hizmetin Tanımı')
    expect(terms.en.sections[1].heading).toBe('1. Description of the Service')
  })

  it('mevcut 10 maddenin sırası ve numaraları değişmez', async () => {
    const { docs } = await load()
    const terms = docs.getLegalDoc('kullanim-kosullari')!
    for (const lang of ['tr', 'en'] as const) {
      const numbered = terms[lang].sections.slice(1).map((s) => s.heading)
      expect(numbered).toHaveLength(10)
      numbered.forEach((heading, i) => expect(heading.startsWith(`${i + 1}. `)).toBe(true))
    }
  })

  it('kısa ad ibaresi: TR “bundan sonra … olarak anılacaktır”, EN “hereinafter referred to as”', async () => {
    const { COMPANY, docs } = await load()
    const terms = docs.getLegalDoc('kullanim-kosullari')!
    const [trLead] = flatten(terms.tr.sections[0] as Section)
    const [enLead] = flatten(terms.en.sections[0] as Section)
    expect(trLead).toBe(`${COMPANY.legalName} (bundan sonra “GLOVAL AI” olarak anılacaktır)`)
    expect(enLead).toBe(`${COMPANY.legalName} (hereinafter referred to as “GLOVAL AI”)`)
  })

  it('unvan, adres ve e-posta company.ts değerleriyle eşleşir; varsayılan telefon satırı yoktur', async () => {
    const { COMPANY, docs } = await load()
    const terms = docs.getLegalDoc('kullanim-kosullari')!
    const tr = flatten(terms.tr.sections[0] as Section)
    const en = flatten(terms.en.sections[0] as Section)
    expect(tr).toContain(`Adres: ${COMPANY.address}`)
    expect(tr.filter((item) => item.startsWith('Telefon:'))).toEqual([])
    expect(tr).toContain(`E-posta: ${COMPANY.supportEmail}`)
    expect(en).toContain(`Address: ${COMPANY.address}`)
    expect(en.filter((item) => item.startsWith('Phone:'))).toEqual([])
    expect(en).toContain(`Email: ${COMPANY.supportEmail}`)
    expect(COMPANY.legalName).toBe(
      'DB AJANS REKLAM MEDYA HİZMETLER BİLİŞİM TEKNOLOJİLERİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
    )
    expect(COMPANY.phone).toBeUndefined()
  })

  it('değerler kopya metin değildir: company.ts ortam değerleri değişince bölüm de değişir', async () => {
    vi.stubEnv('NEXT_PUBLIC_COMPANY_LEGAL_NAME', 'TEST UNVAN LTD. ŞTİ.')
    vi.stubEnv('NEXT_PUBLIC_COMPANY_ADDRESS', 'Test Mah. Deneme Sk. No:1 Kadıköy/İstanbul')
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', 'destek@example.test')
    const { docs } = await load('0212 111 22 33')
    const terms = docs.getLegalDoc('kullanim-kosullari')!
    for (const lang of ['tr', 'en'] as const) {
      const text = flatten(terms[lang].sections[0] as Section).join('\n')
      expect(text).toContain('TEST UNVAN LTD. ŞTİ.')
      expect(text).toContain('Test Mah. Deneme Sk. No:1 Kadıköy/İstanbul')
      expect(text).toContain('0212 111 22 33')
      expect(text).toContain('destek@example.test')
    }
  })
})

describe('Google Ads legal disclosures', () => {
  it('dates and explains campaign creation, budget, data use and cancellation in Turkish and English', async () => {
    const { docs } = await load()
    const terms = docs.getLegalDoc('kullanim-kosullari')!
    const privacy = docs.getLegalDoc('gizlilik-politikasi')!

    expect(terms.lastUpdated).toBe('2026-11-05')
    expect(privacy.lastUpdated).toBe('2026-11-07')

    for (const lang of ['tr', 'en'] as const) {
      const termsSection = terms[lang].sections.find((section) => section.heading.startsWith('8. '))
      expect(termsSection).toBeDefined()
      const termsText = flatten(termsSection as Section).join(' ').toLowerCase()
      const privacyText = privacy[lang].sections.flatMap((section) => flatten(section)).join(' ').toLowerCase()

      expect(termsText).toContain('google ads')
      expect(termsText).toContain('paused')
      expect(termsText).toMatch(/daily budget|günlük bütçe/)
      expect(termsText).toMatch(/cancel|iptal/)
      expect(privacyText).toMatch(/campaign plan|kampanya plan/)
      expect(privacyText).toMatch(/google ads api/)
      expect(privacyText).toMatch(/pause|duraklat/)
    }
  })
})

describe('LEGAL_LAST_UPDATED', () => {
  it('tek sabittir ve 2026-10-21 değerindedir', async () => {
    const { LEGAL_LAST_UPDATED } = await load()
    expect(LEGAL_LAST_UPDATED).toBe('2026-10-21')
  })
})

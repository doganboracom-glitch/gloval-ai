import { afterEach, describe, expect, it, vi } from 'vitest'

type Block = { type: 'p'; text: string } | { type: 'list'; items: string[] }
type Section = { heading: string; blocks: Block[] }

async function load() {
  vi.resetModules()
  const company = await import('@/lib/legal/company')
  const docs = await import('@/lib/legal/documents')
  return { COMPANY: company.COMPANY, LEGAL_LAST_UPDATED: company.LEGAL_LAST_UPDATED, docs }
}

function flatten(section: Section): string[] {
  return section.blocks.flatMap((b) => (b.type === 'p' ? [b.text] : b.items))
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

  it('unvan, adres, telefon ve e-posta company.ts değerleriyle birebir eşleşir', async () => {
    const { COMPANY, docs } = await load()
    const terms = docs.getLegalDoc('kullanim-kosullari')!
    const tr = flatten(terms.tr.sections[0] as Section)
    const en = flatten(terms.en.sections[0] as Section)
    expect(tr).toContain(`Adres: ${COMPANY.address}`)
    expect(tr).toContain(`Telefon: ${COMPANY.phone}`)
    expect(tr).toContain(`E-posta: ${COMPANY.supportEmail}`)
    expect(en).toContain(`Address: ${COMPANY.address}`)
    expect(en).toContain(`Phone: ${COMPANY.phone}`)
    expect(en).toContain(`Email: ${COMPANY.supportEmail}`)
    expect(COMPANY.legalName).toBe(
      'DB AJANS REKLAM MEDYA HİZMETLER BİLİŞİM TEKNOLOJİLERİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
    )
    expect(COMPANY.phone).toBe('0850 308 40 88')
  })

  it('değerler kopya metin değildir: company.ts ortam değerleri değişince bölüm de değişir', async () => {
    vi.stubEnv('NEXT_PUBLIC_COMPANY_LEGAL_NAME', 'TEST UNVAN LTD. ŞTİ.')
    vi.stubEnv('NEXT_PUBLIC_COMPANY_ADDRESS', 'Test Mah. Deneme Sk. No:1 Kadıköy/İstanbul')
    vi.stubEnv('NEXT_PUBLIC_COMPANY_PHONE', '0212 111 22 33')
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_EMAIL', 'destek@example.test')
    const { docs } = await load()
    const terms = docs.getLegalDoc('kullanim-kosullari')!
    for (const lang of ['tr', 'en'] as const) {
      const text = flatten(terms[lang].sections[0] as Section).join('\n')
      expect(text).toContain('TEST UNVAN LTD. ŞTİ.')
      expect(text).toContain('Test Mah. Deneme Sk. No:1 Kadıköy/İstanbul')
      expect(text).toContain('0212 111 22 33')
      expect(text).toContain('destek@example.test')
      expect(text).not.toContain('0850 308 40 88')
    }
  })
})

describe('LEGAL_LAST_UPDATED', () => {
  it('tek sabittir ve 2026-10-21 değerindedir', async () => {
    const { LEGAL_LAST_UPDATED } = await load()
    expect(LEGAL_LAST_UPDATED).toBe('2026-10-21')
  })
})

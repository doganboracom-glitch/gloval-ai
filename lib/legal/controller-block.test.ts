import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { fallbackWebsite } from '@/lib/website-schema'

type Block =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'link'; href: string; label: string; external?: boolean }
type Section = { heading: string; blocks: Block[] }

const ROOT = process.cwd()

async function load(phone = '') {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_COMPANY_PHONE', phone)
  const company = await import('@/lib/legal/company')
  const docs = await import('@/lib/legal/documents')
  return { COMPANY: company.COMPANY, docs }
}

function flatten(section: Section): string[] {
  return section.blocks.flatMap((block) => {
    if (block.type === 'p') return [block.text]
    if (block.type === 'list') return block.items
    return [block.label]
  })
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Gizlilik Politikası — Veri Sorumlusu bloğu', () => {
  it('belgenin başında, 1. maddeden önce yer alır — tr ve en', async () => {
    const { docs } = await load()
    const privacy = docs.getLegalDoc('gizlilik-politikasi')!
    expect(privacy.tr.sections[0].heading).toBe('Veri Sorumlusu')
    expect(privacy.en.sections[0].heading).toBe('Data Controller')
    expect(privacy.tr.sections[1].heading).toBe('1. İşlenen Kişisel Veriler')
    expect(privacy.en.sections[1].heading).toBe('1. Personal Data We Process')
  })

  it('mevcut 8 maddenin sırası ve numaraları değişmez', async () => {
    const { docs } = await load()
    const privacy = docs.getLegalDoc('gizlilik-politikasi')!
    for (const lang of ['tr', 'en'] as const) {
      const numbered = privacy[lang].sections
        .filter((section) => /^\d+\. /.test(section.heading))
        .map((section) => section.heading)
      expect(numbered).toHaveLength(8)
      numbered.forEach((heading, i) => expect(heading.startsWith(`${i + 1}. `)).toBe(true))
    }
  })

  it('Google Ads bölümünü iki dilde, Limited Use beyanı ve bağlantılarıyla ekler', async () => {
    const { docs } = await load()
    const privacy = docs.getLegalDoc('gizlilik-politikasi')!
    expect(privacy.lastUpdated).toBe('2026-10-31')
    expect(docs.getLegalDoc('kvkk')?.lastUpdated).toBeUndefined()

    const limitedUseStatements = {
      tr: "GLOVAL AI'ın Google API'lerinden aldığı bilgileri kullanımı ve başka bir uygulamaya aktarması, Google API Services User Data Policy'ye (Limited Use gereklilikleri dahil) uygun olacaktır.",
      en: "GLOVAL AI's use and transfer of information obtained from Google APIs to another application will comply with the Google API Services User Data Policy, including the Limited Use requirements.",
    }
    const policyUrl =
      'https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes'

    for (const lang of ['tr', 'en'] as const) {
      const sections = privacy[lang].sections
      const heading = lang === 'tr' ? 'Google Ads verileri (GLOVAL Ads)' : 'Google Ads data (GLOVAL Ads)'
      const sectionIndex = sections.findIndex((section) => section.heading === heading)
      expect(sectionIndex).toBeGreaterThan(0)
      expect(sections[sectionIndex - 1].heading).toMatch(/^4\. /)
      expect(sections[sectionIndex + 1].heading).toMatch(/^5\. /)

      const section = sections[sectionIndex] as Section
      expect(flatten(section)).toContain(limitedUseStatements[lang])
      const links = section.blocks.filter((block) => block.type === 'link')
      expect(links.map((item) => item.href)).toContain(policyUrl)
      expect(links.map((item) => item.href)).toContain('https://myaccount.google.com/permissions')
      expect(links.map((item) => item.href)).toContain('/yasal/kvkk')
    }
  })

  it('kısa ad ibaresi tr ve en metinde bulunur', async () => {
    const { COMPANY, docs } = await load()
    const privacy = docs.getLegalDoc('gizlilik-politikasi')!
    const [trLead] = flatten(privacy.tr.sections[0] as Section)
    const [enLead] = flatten(privacy.en.sections[0] as Section)
    expect(trLead).toBe(`${COMPANY.legalName} (bundan sonra “GLOVAL AI” olarak anılacaktır)`)
    expect(enLead).toBe(`${COMPANY.legalName} (hereinafter referred to as “GLOVAL AI”)`)
  })

  it('unvan, adres ve e-posta company.ts değerleriyle eşleşir; telefon tanımlı değilse satır eklenmez', async () => {
    const { COMPANY, docs } = await load()
    const privacy = docs.getLegalDoc('gizlilik-politikasi')!
    const tr = flatten(privacy.tr.sections[0] as Section)
    const en = flatten(privacy.en.sections[0] as Section)
    expect(tr).toContain(`Adres: ${COMPANY.address}`)
    expect(tr.filter((item) => item.startsWith('Telefon:'))).toEqual([])
    expect(tr).toContain(`E-posta: ${COMPANY.kvkkEmail}`)
    expect(en).toContain(`Address: ${COMPANY.address}`)
    expect(en.filter((item) => item.startsWith('Phone:'))).toEqual([])
    expect(en).toContain(`Email: ${COMPANY.kvkkEmail}`)
    expect(COMPANY.phone).toBeUndefined()
  })

  it('değerler company.ts kaynağından gelir: ortam değişkeni değişince bloğa yansır', async () => {
    vi.stubEnv('NEXT_PUBLIC_COMPANY_LEGAL_NAME', 'ÖRNEK ŞİRKET A.Ş.')
    vi.stubEnv('NEXT_PUBLIC_COMPANY_ADDRESS', 'Örnek Mah. Örnek Sk. No:1')
    vi.stubEnv('NEXT_PUBLIC_KVKK_EMAIL', 'kvkk@ornek.com')
    const { docs } = await load('0212 111 22 33')
    const privacy = docs.getLegalDoc('gizlilik-politikasi')!
    const tr = flatten(privacy.tr.sections[0] as Section)
    const en = flatten(privacy.en.sections[0] as Section)
    expect(tr).toEqual([
      'ÖRNEK ŞİRKET A.Ş. (bundan sonra “GLOVAL AI” olarak anılacaktır)',
      'Adres: Örnek Mah. Örnek Sk. No:1',
      'Telefon: 0212 111 22 33',
      'E-posta: kvkk@ornek.com',
    ])
    expect(en).toEqual([
      'ÖRNEK ŞİRKET A.Ş. (hereinafter referred to as “GLOVAL AI”)',
      'Address: Örnek Mah. Örnek Sk. No:1',
      'Phone: 0212 111 22 33',
      'Email: kvkk@ornek.com',
    ])
  })
})

describe('KVKK Aydınlatma Metni — Veri Sorumlusu kimliği', () => {
  it('mevcut 7 maddenin sırası ve numaraları değişmez; yeni bölüm eklenmez', async () => {
    const { docs } = await load()
    const kvkk = docs.getLegalDoc('kvkk')!
    for (const lang of ['tr', 'en'] as const) {
      const headings = kvkk[lang].sections.map((s) => s.heading)
      expect(headings).toHaveLength(7)
      headings.forEach((heading, i) => expect(heading.startsWith(`${i + 1}. `)).toBe(true))
    }
    expect(kvkk.tr.sections[0].heading).toBe('1. Veri Sorumlusu')
    expect(kvkk.en.sections[0].heading).toBe('1. Data Controller')
  })

  it('kısa ad ibaresi giriş metninde zaten var ve tekrarlanmaz — tr ve en', async () => {
    const { COMPANY, docs } = await load()
    const kvkk = docs.getLegalDoc('kvkk')!
    const trAll = JSON.stringify(kvkk.tr)
    const enAll = JSON.stringify(kvkk.en)
    expect(kvkk.tr.intro[0]).toContain(`${COMPANY.legalName} (bundan sonra “GLOVAL AI” olarak anılacaktır)`)
    expect(kvkk.en.intro[0]).toContain(`${COMPANY.legalName} (hereinafter referred to as “GLOVAL AI”)`)
    expect(trAll.split('bundan sonra').length - 1).toBe(1)
    expect(enAll.split('hereinafter referred to as').length - 1).toBe(1)
  })

  it('unvan, adres, telefon ve e-posta company.ts değerleriyle eşleşir ve her alan bir kez geçer', async () => {
    const { COMPANY, docs } = await load()
    const kvkk = docs.getLegalDoc('kvkk')!
    const tr = flatten(kvkk.tr.sections[0] as Section)
    const en = flatten(kvkk.en.sections[0] as Section)
    expect(tr).toEqual([
      `Unvan: ${COMPANY.legalName}`,
      `Adres: ${COMPANY.address}`,
      `Başvuru e-posta: ${COMPANY.kvkkEmail}`,
    ])
    expect(en).toEqual([
      `Legal name: ${COMPANY.legalName}`,
      `Address: ${COMPANY.address}`,
      `Application email: ${COMPANY.kvkkEmail}`,
    ])
  })

  it('değerler company.ts kaynağından gelir: ortam değişkeni değişince bloğa yansır', async () => {
    vi.stubEnv('NEXT_PUBLIC_KVKK_EMAIL', 'kvkk@ornek.com')
    const { docs } = await load('0212 111 22 33')
    const kvkk = docs.getLegalDoc('kvkk')!
    expect(flatten(kvkk.tr.sections[0] as Section)).toContain('Telefon: 0212 111 22 33')
    expect(flatten(kvkk.tr.sections[0] as Section)).toContain('Başvuru e-posta: kvkk@ornek.com')
    expect(flatten(kvkk.en.sections[0] as Section)).toContain('Phone: 0212 111 22 33')
    expect(flatten(kvkk.en.sections[0] as Section)).toContain('Application email: kvkk@ornek.com')
  })
})

describe('Çerez Politikası ve diğer belgeler etkilenmez', () => {
  it('çerez politikasında veri sorumlusu bloğu veya telefon eklenmemiştir', async () => {
    const { COMPANY, docs } = await load()
    const cookies = docs.getLegalDoc('cerez-politikasi')!
    const text = JSON.stringify(cookies)
    expect(text).not.toContain('Veri Sorumlusu')
    expect(text).not.toContain('Data Controller')
    expect(text).not.toMatch(/(?:Telefon|Phone):/)
    expect(text).not.toContain(COMPANY.address)
    expect(cookies.tr.sections.map((s) => s.heading)).toEqual([
      '1. Çerez Nedir?',
      '2. Kullandığımız Çerez Türleri',
      '3. Tercihlerinizi Yönetme',
    ])
  })
})

describe('Satıcı telefon alanı isteğe bağlıdır', () => {
  it('telefon tanımlı değilken tüm yasal dokümanlardan telefon satırını çıkarır', async () => {
    const { docs } = await load()
    for (const slug of [
      'gizlilik-politikasi',
      'kvkk',
      'kullanim-kosullari',
      'mesafeli-satis-sozlesmesi',
      'on-bilgilendirme-formu',
    ]) {
      const doc = docs.getLegalDoc(slug)!
      expect(JSON.stringify(doc.tr)).not.toMatch(/Telefon:/)
      expect(JSON.stringify(doc.en)).not.toMatch(/Phone:/)
    }
  })

  it('telefon tanımlıysa mesafeli satış ve ön bilgilendirme satırlarını gösterir', async () => {
    const { docs } = await load('0212 111 22 33')
    for (const slug of ['mesafeli-satis-sozlesmesi', 'on-bilgilendirme-formu']) {
      const doc = docs.getLegalDoc(slug)!
      expect(JSON.stringify(doc.tr)).toContain('Telefon: 0212 111 22 33')
      expect(JSON.stringify(doc.en)).toContain('Phone: 0212 111 22 33')
    }
  })
})

describe('yayındaki müşteri siteleri etkilenmez', () => {
  it('yayın renderer’ı ve tenant rotaları yasal modülleri içe aktarmaz', () => {
    const offenders: string[] = []
    for (const dir of ['components/website-renderer', 'app/site']) {
      for (const file of walk(join(ROOT, dir))) {
        const src = readFileSync(file, 'utf8')
        if (/lib\/legal\/(company|documents)/.test(src)) offenders.push(relative(ROOT, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('şirket bilgileri değişse de müşteri sitesi HTML’i birebir aynı kalır', () => {
    const render = () =>
      renderToStaticMarkup(
        createElement(WebsiteRenderer, {
          site: fallbackWebsite('kahve dükkanı ve atölye', 'tr'),
          pageRouting: true,
          initialPage: null,
        }),
      )
    const before = render()
    vi.stubEnv('NEXT_PUBLIC_COMPANY_LEGAL_NAME', 'BAŞKA ŞİRKET A.Ş.')
    vi.stubEnv('NEXT_PUBLIC_COMPANY_PHONE', '0212 000 00 00')
    vi.stubEnv('NEXT_PUBLIC_KVKK_EMAIL', 'baska@ornek.com')
    expect(render()).toBe(before)
    expect(before).not.toContain('Veri Sorumlusu')
    expect(before).not.toMatch(/(?:Telefon|Phone):/)
  })
})

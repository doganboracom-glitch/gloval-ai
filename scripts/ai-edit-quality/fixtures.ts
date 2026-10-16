import { fallbackWebsite, websiteSchema, type Section, type WebsiteSchema } from '@/lib/website-schema'

/**
 * Synthetic sites only: generated from the offline sector templates, so the
 * audit never touches a real project and carries no personal data. The phone
 * and e-mail values are the template's own placeholders.
 */

export function clinicFixture(): WebsiteSchema {
  return websiteSchema.parse(fallbackWebsite('Kadıköy diş kliniği için web sitesi oluştur', 'tr'))
}

/** The clinic site plus a products + categories showcase, which makes it a storefront. */
export function storeFixture(): WebsiteSchema {
  const base = clinicFixture()
  const products: Section = {
    type: 'products',
    title: 'Öne çıkan ürünler',
    layout: 'grid',
    source: 'latest',
    limit: 4,
    items: [
      { name: 'Elektrikli Diş Fırçası', price: '₺899', imagePrompt: 'An electric toothbrush on a white shelf', category: 'Bakım' },
      { name: 'Ağız Gargarası', price: '₺149', imagePrompt: 'A bottle of mouthwash on a bathroom shelf', category: 'Bakım' },
    ],
  }
  const categories: Section = {
    type: 'categories',
    title: 'Kategoriler',
    items: [
      { name: 'Bakım', imagePrompt: 'Oral care products flat lay' },
      { name: 'Aksesuar', imagePrompt: 'Dental accessories flat lay' },
    ],
  }
  return websiteSchema.parse({
    ...base,
    sections: [base.sections[0], categories, products, ...base.sections.slice(1)],
  })
}

/** What a visitor sees in the header: page titles on multi-page sites, anchor links otherwise. */
export function visibleMenu(site: WebsiteSchema): string[] {
  return site.pages.length > 1 ? site.pages.map((p) => p.title) : site.navigation.links.map((l) => l.label)
}

export function sectionOf<T extends Section['type']>(site: WebsiteSchema, type: T) {
  return site.sections.find((s) => s.type === type) as Extract<Section, { type: T }> | undefined
}

export function digits(value: string | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

export function hueOf(hex: string): { h: number; s: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return { h: 0, s: 0 }
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  const l = (max + min) / 2
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(2 * l - 1)) }
}

export function primaryHex(site: WebsiteSchema): string {
  return site.theme.palette.find((c) => c.name === 'primary')?.hex ?? ''
}

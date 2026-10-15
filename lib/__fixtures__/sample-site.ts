import { fallbackWebsite, type Section, type WebsiteSchema } from '@/lib/website-schema'

const IMAGE = 'a product photo on a plain background'

/** A schema-valid site with one flagged hero, testimonial, stat, plan and three products. */
export function buildSampleSections(): Section[] {
  return [
    {
      type: 'hero',
      title: 'Hoş geldiniz',
      description: 'Kısa açıklama',
      trustText: '500+ mutlu müşteri',
      sample: true,
    },
    {
      type: 'testimonials',
      title: 'Yorumlar',
      sample: true,
      items: [
        { quote: 'Harika hizmet', author: 'Ayşe Yılmaz', role: 'Müşteri', sample: true },
        { quote: 'Gerçek bir yorum', author: 'Mehmet Kaya' },
      ],
    },
    {
      type: 'stats',
      sample: true,
      items: [
        { value: '10 yıl', label: 'Deneyim', sample: true },
        { value: '24/7', label: 'Destek', sample: true },
      ],
    },
    {
      type: 'pricing',
      title: 'Fiyatlar',
      sample: true,
      plans: [{ name: 'Başlangıç', price: '₺499', period: '/ay', features: ['Özellik'], sample: true }],
    },
    {
      type: 'products',
      title: 'Ürünler',
      sample: true,
      items: [
        { name: 'Ürün A', price: '₺100', oldPrice: '₺150', imagePrompt: IMAGE, sample: true },
        { name: 'Ürün B', price: '₺200', badge: 'Yeni', imagePrompt: IMAGE, sample: true },
        { name: 'Ürün C', price: '₺300', imagePrompt: IMAGE, sample: true },
      ],
    },
  ] as Section[]
}

export function buildSampleSite(sections: Section[] = buildSampleSections()): WebsiteSchema {
  return { ...fallbackWebsite('kahve dükkanı', 'tr'), sections }
}

/** The same site with no sample flag anywhere. */
export function buildCleanSite(): WebsiteSchema {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => key !== 'sample')
          .map(([key, v]) => [key, strip(v)]),
      )
    }
    return value
  }
  return buildSampleSite(strip(buildSampleSections()) as Section[])
}

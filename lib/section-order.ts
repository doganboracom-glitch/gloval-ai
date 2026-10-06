import { isStorefront, type WebsiteSchema } from '@/lib/website-schema'

/**
 * Standard top-to-bottom order for corporate sites. Types not listed keep their
 * relative position after the known ones; the footer is always last.
 */
const CORPORATE_ORDER = [
  'slider',
  'hero',
  'about',
  'services',
  'features',
  'process',
  'portfolio',
  'gallery',
  'team',
  'stats',
  'pricing',
  'testimonials',
  'faq',
  'cta',
  'contact',
  'footer',
] as const

const RANK = new Map<string, number>(CORPORATE_ORDER.map((type, i) => [type, i]))

/**
 * Returns the site with its homepage sections in the standard corporate order.
 * Applied once at generation time (never at render time) so the owner's manual
 * reordering in the editor is respected afterwards. Storefronts keep their own
 * sector-specific order, and the sort is stable so same-type sections (e.g. two
 * product rails) keep their relative order.
 */
export function normalizeCorporateSectionOrder<T extends WebsiteSchema>(site: T): T {
  if (isStorefront(site)) return site
  const ranked = site.sections.map((section, index) => ({
    section,
    index,
    rank: RANK.get(section.type) ?? CORPORATE_ORDER.indexOf('footer') - 0.5,
  }))
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index)
  return { ...site, sections: ranked.map((r) => r.section) }
}

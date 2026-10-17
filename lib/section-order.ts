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
  'blogLatest',
  'faq',
  'cta',
  'contact',
  'footer',
] as const

const RANK = new Map<string, number>(CORPORATE_ORDER.map((type, i) => [type, i]))

type SectionLike = WebsiteSchema['sections'][number]

export function hasBlogLatestSection(site: Pick<WebsiteSchema, 'sections'>): boolean {
  return site.sections.some((section) => section.type === 'blogLatest')
}

/** New sites: right above the FAQ, else above contact, else above the CTA, else above the footer. */
export function defaultBlogLatestIndex(sections: readonly SectionLike[]): number {
  for (const type of ['faq', 'contact', 'cta', 'footer']) {
    const index = sections.findIndex((section) => section.type === type)
    if (index >= 0) return index
  }
  return sections.length
}

function insertBlogLatest<T extends WebsiteSchema>(site: T, index: number, hidden?: boolean): T {
  const section = { type: 'blogLatest', ...(hidden ? { hidden: true } : {}) } as SectionLike
  const sections = [...site.sections]
  sections.splice(index, 0, section)
  return { ...site, sections }
}

/** Adds the movable latest-posts section to a newly generated site at its default spot. */
export function withDefaultBlogLatest<T extends WebsiteSchema>(site: T): T {
  if (hasBlogLatestSection(site)) return site
  return insertBlogLatest(site, defaultBlogLatestIndex(site.sections))
}

/**
 * Existing sites used to get a fixed block (after the hero, or above the footer).
 * This lists it as a real section at exactly that spot, so nothing moves on screen.
 * A site whose owner had switched the block off gets the section hidden.
 */
export function withLegacyBlogLatest<T extends WebsiteSchema>(site: T): T {
  if (hasBlogLatestSection(site)) return site
  const hidden = site.blogSettings?.showLatest === false
  if (site.blogSettings?.latestPlacement === 'after-hero') {
    const first = site.sections[0]?.type
    return insertBlogLatest(site, first === 'hero' || first === 'slider' ? 1 : 0, hidden)
  }
  const footer = site.sections.findIndex((section) => section.type === 'footer')
  return insertBlogLatest(site, footer >= 0 ? footer : site.sections.length, hidden)
}

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

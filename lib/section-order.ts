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

/**
 * A newly generated site starts with the blog menu link and the home blog
 * section both off; the owner turns them on in the Blog tab.
 */
export function withBlogOffByDefault<T extends WebsiteSchema>(site: T): T {
  if (site.blogSettings) return site
  return { ...site, blogSettings: { showInMenu: false, showLatest: false } }
}

/**
 * Switches the home blog section on or off. Off removes it from the page (and so
 * from the Design list) after remembering its index; on brings it back there, or
 * at the default spot (above the FAQ) the first time. A hidden section is shown.
 */
export function setBlogLatestEnabled<T extends WebsiteSchema>(site: T, enabled: boolean): T {
  const index = site.sections.findIndex((section) => section.type === 'blogLatest')
  if (!enabled) {
    if (index < 0) return site
    return {
      ...site,
      sections: site.sections.filter((_, i) => i !== index),
      blogSettings: { ...(site.blogSettings ?? {}), latestIndex: index },
    }
  }
  if (index >= 0) {
    const current = site.sections[index] as SectionLike & { hidden?: boolean }
    if (!current.hidden) return site
    const { hidden: _hidden, ...visible } = current
    const sections = [...site.sections]
    sections[index] = visible as SectionLike
    return { ...site, sections }
  }
  const saved = site.blogSettings?.latestIndex
  const footer = site.sections.findIndex((section) => section.type === 'footer')
  const limit = footer >= 0 ? footer : site.sections.length
  const at = typeof saved === 'number' ? Math.min(saved, limit) : defaultBlogLatestIndex(site.sections)
  return insertBlogLatest(site, at)
}

/**
 * Existing sites used to get a fixed block (after the hero, or above the footer).
 * This lists it as a real section at exactly that spot, so nothing moves on screen.
 * A site whose owner had switched the block off gets no section at all.
 */
export function withLegacyBlogLatest<T extends WebsiteSchema>(site: T): T {
  if (hasBlogLatestSection(site)) return site
  if (site.blogSettings?.showLatest === false) return site
  if (site.blogSettings?.latestPlacement === 'after-hero') {
    const first = site.sections[0]?.type
    return insertBlogLatest(site, first === 'hero' || first === 'slider' ? 1 : 0)
  }
  const footer = site.sections.findIndex((section) => section.type === 'footer')
  return insertBlogLatest(site, footer >= 0 ? footer : site.sections.length)
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

import { blankSection } from '@/lib/website-edit-operations'
import type { Section, WebsiteSchema } from '@/lib/website-schema'

/**
 * "Bölüm ekle" seeds a section with placeholder entries so the schema stays valid
 * (several list types need at least one item). Those entries are for the owner to
 * replace: the editor preview shows them, the published site does not.
 *
 * Detection is structural rather than flag-based: an entry is a placeholder while it
 * still equals the blank template's entry. Editing any field of it, or uploading an
 * image, makes it real and it appears on the public site. Nothing is stored, so older
 * sites need no migration and AI-generated content (never equal to a template) is untouched.
 */

const LIST_KEY: Partial<Record<Section['type'], string>> = {
  slider: 'slides',
  services: 'items',
  features: 'items',
  stats: 'items',
  pricing: 'plans',
  testimonials: 'items',
  gallery: 'items',
  portfolio: 'items',
  categories: 'items',
  process: 'steps',
  faq: 'items',
}

/** Types that are a single block of copy: hidden as a whole while untouched. */
const WHOLE_SECTION_TYPES: ReadonlyArray<Section['type']> = ['about', 'contact', 'cta', 'hero']

/** Keys the platform may add to an untouched entry (e.g. a slug on save). */
const PLATFORM_KEYS = new Set(['slug', 'sample'])
const LANGS = ['tr', 'en'] as const

const blankCache = new Map<string, Record<string, unknown>>()

function blankFor(type: Section['type'], lang: (typeof LANGS)[number]): Record<string, unknown> {
  const key = `${lang}:${type}`
  let blank = blankCache.get(key)
  if (!blank) {
    blank = blankSection(type, lang, { corporate: true }) as unknown as Record<string, unknown>
    blankCache.set(key, blank)
  }
  return blank
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function matchesBlankEntry(entry: unknown, blankEntry: unknown): boolean {
  if (!entry || typeof entry !== 'object' || !blankEntry || typeof blankEntry !== 'object') return false
  const record = entry as Record<string, unknown>
  const blank = blankEntry as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) continue
    if (!(key in blank) && !PLATFORM_KEYS.has(key)) return false
  }
  return Object.keys(blank).every((key) => sameValue(record[key], blank[key]))
}

function isPlaceholderEntry(type: Section['type'], listKey: string, entry: unknown): boolean {
  return LANGS.some((lang) => {
    const list = blankFor(type, lang)[listKey]
    return Array.isArray(list) && list.some((blankEntry) => matchesBlankEntry(entry, blankEntry))
  })
}

function isUntouchedWholeSection(section: Section): boolean {
  const { hidden: _hidden, sample: _sample, ...rest } = section as Section & { hidden?: boolean; sample?: boolean }
  return LANGS.some((lang) => {
    const { hidden: _h, sample: _s, ...blank } = blankFor(section.type, lang) as Record<string, unknown>
    return sameValue(rest, blank)
  })
}

/** The section as the public site should draw it, or null when nothing real is left in it. */
function publicSection(section: Section): Section | null {
  if (WHOLE_SECTION_TYPES.includes(section.type)) {
    return isUntouchedWholeSection(section) ? null : section
  }
  const listKey = LIST_KEY[section.type]
  if (!listKey) return section
  const list = (section as unknown as Record<string, unknown>)[listKey]
  if (!Array.isArray(list)) return section
  const kept = list.filter((entry) => !isPlaceholderEntry(section.type, listKey, entry))
  if (kept.length === list.length) return section
  if (kept.length === 0) return null
  return { ...section, [listKey]: kept } as Section
}

export function stripPlaceholdersFromSections(sections: readonly Section[]): Section[] {
  let changed = false
  const next: Section[] = []
  for (const section of sections) {
    const shown = publicSection(section)
    if (shown !== section) changed = true
    if (shown) next.push(shown)
  }
  return changed ? next : (sections as Section[])
}

/** Public view of a site: placeholder entries and untouched blank sections removed. Same object when there are none. */
export function stripPlaceholders(site: WebsiteSchema): WebsiteSchema {
  const sections = stripPlaceholdersFromSections(site.sections)
  const pages = site.pages?.map((page) => {
    if (!page.sections) return page
    const pageSections = stripPlaceholdersFromSections(page.sections)
    return pageSections === page.sections ? page : { ...page, sections: pageSections }
  })
  const pagesChanged = pages ? pages.some((page, i) => page !== site.pages?.[i]) : false
  if (sections === site.sections && !pagesChanged) return site
  return { ...site, sections, ...(pagesChanged ? { pages } : {}) }
}

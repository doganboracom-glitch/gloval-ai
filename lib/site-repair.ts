import { sectionSchema, type SectionType } from '@/lib/website-schema'
import type { FieldPath, RepairCode, RepairOptions } from '@/lib/ai-repair'

/** The schema's own limit; kept in step with `websiteSchema.sections.max(12)`. */
export const SITE_SECTION_MAX = 12
export const SITE_PAGE_MAX = 8

const KNOWN_SECTION_TYPES: ReadonlySet<string> = new Set(
  sectionSchema.options.map((option) => option.shape.type.value as string),
)

/**
 * Types removed first when a site has too many sections. Earlier entries are
 * the least important; hero, contact and footer are never in this list and are
 * always kept. The storefront pair (categories, products) is dropped last so a
 * shop never loses its catalog sections.
 */
const DROP_ORDER: ReadonlyArray<SectionType> = [
  'stats',
  'process',
  'team',
  'portfolio',
  'gallery',
  'slider',
  'testimonials',
  'faq',
  'cta',
  'pricing',
  'features',
  'services',
  'about',
  'categories',
  'products',
]

const PROTECTED: ReadonlySet<string> = new Set(['hero', 'contact', 'footer'])

type Loose = Record<string, unknown>

function isRecord(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Picks which sections survive when there are more than `max`. Order of the
 * survivors is unchanged. Extra copies of a type go first (the first copy is
 * the one the page layout expects), then whole types by `DROP_ORDER`, always
 * removing the LAST copy of a type before earlier ones.
 */
export function trimSectionsToLimit<T extends { type: string }>(sections: T[], max: number = SITE_SECTION_MAX): T[] {
  if (sections.length <= max) return sections
  const keep = sections.map(() => true)
  let remaining = sections.length
  const drop = (index: number) => {
    if (keep[index]) {
      keep[index] = false
      remaining--
    }
  }

  const seen = new Set<string>()
  const duplicates: number[] = []
  sections.forEach((section, index) => {
    if (seen.has(section.type)) duplicates.push(index)
    else seen.add(section.type)
  })
  for (const index of duplicates.reverse()) {
    if (remaining <= max) break
    drop(index)
  }

  for (const type of DROP_ORDER) {
    for (let index = sections.length - 1; index >= 0 && remaining > max; index--) {
      if (keep[index] && sections[index].type === type) drop(index)
    }
    if (remaining <= max) break
  }

  // Everything left is protected; as a last resort cut from the middle.
  for (let index = sections.length - 2; index > 0 && remaining > max; index--) {
    if (keep[index] && !PROTECTED.has(sections[index].type)) drop(index)
  }
  return sections.filter((_, index) => keep[index])
}

const SECTION_TITLES: Partial<Record<SectionType, { tr: string; en: string }>> = {
  about: { tr: 'Hakkımızda', en: 'About us' },
  services: { tr: 'Hizmetlerimiz', en: 'Our services' },
  features: { tr: 'Öne çıkanlar', en: 'Highlights' },
  stats: { tr: 'Rakamlarla biz', en: 'By the numbers' },
  pricing: { tr: 'Fiyatlandırma', en: 'Pricing' },
  testimonials: { tr: 'Müşteri yorumları', en: 'What clients say' },
  gallery: { tr: 'Galeri', en: 'Gallery' },
  portfolio: { tr: 'Çalışmalarımız', en: 'Our work' },
  products: { tr: 'Ürünler', en: 'Products' },
  categories: { tr: 'Kategoriler', en: 'Categories' },
  process: { tr: 'Nasıl çalışıyoruz', en: 'How we work' },
  team: { tr: 'Ekibimiz', en: 'Our team' },
  faq: { tr: 'Sık sorulan sorular', en: 'FAQ' },
  contact: { tr: 'İletişim', en: 'Contact' },
  cta: { tr: 'Bizimle çalışın', en: 'Work with us' },
}

export type SiteRepairContext = {
  lang: 'tr' | 'en'
  /** A neutral brand name taken from the owner's brief when the model gave none. */
  siteName?: string
  /** Generation trims surplus sections; edits must not silently delete the owner's sections. */
  trimSections: boolean
}

function blank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === ''
}

function titleFromSlug(slug: unknown, lang: 'tr' | 'en'): string {
  if (typeof slug === 'string' && slug.trim() && slug !== 'home') {
    const words = slug.replace(/[-_]+/g, ' ').trim()
    return words.charAt(0).toLocaleUpperCase(lang) + words.slice(1)
  }
  return lang === 'tr' ? 'Ana Sayfa' : 'Home'
}

/** Cheap brand name from the brief: the first two words, never empty. */
export function siteNameFromPrompt(prompt: string): string {
  const words = prompt.trim().replace(/\s+/g, ' ').split(' ').slice(0, 2).join(' ')
  return words || 'gloval.ai'
}

export function siteRepairOptions(context: SiteRepairContext): RepairOptions {
  const { lang, siteName, trimSections } = context

  return {
    preprocess(value, record) {
      if (!isRecord(value)) return value

      if (Array.isArray(value.sections)) {
        const before = value.sections.length
        let sections = (value.sections as unknown[]).filter(
          (section): section is Loose & { type: string } =>
            isRecord(section) && typeof section.type === 'string' && KNOWN_SECTION_TYPES.has(section.type),
        )
        for (let i = sections.length; i < before; i++) record('section_dropped', 'sections[]')
        if (trimSections && sections.length > SITE_SECTION_MAX) {
          const trimmed = trimSectionsToLimit(sections)
          for (let i = trimmed.length; i < sections.length; i++) record('sections_trimmed', 'sections')
          sections = trimmed
        }
        value.sections = sections
        for (const section of sections) {
          if (typeof section.title === 'string' && blank(section.title)) {
            const title = SECTION_TITLES[section.type as SectionType]?.[lang]
            if (title) {
              section.title = title
              record('field_defaulted', 'sections[].title')
            }
          }
        }
      }

      if (Array.isArray(value.pages)) {
        const pages = value.pages.filter(isRecord)
        for (const page of pages) {
          if (blank(page.title)) {
            page.title = titleFromSlug(page.slug, lang)
            record('field_defaulted', 'pages[].title')
          }
          if (blank(page.slug)) {
            page.slug = page.isHome ? 'home' : String(page.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page'
            record('field_defaulted', 'pages[].slug')
          }
        }
        if (pages.length > SITE_PAGE_MAX) {
          const home = pages.find((page) => page.isHome) ?? pages[0]
          const rest = pages.filter((page) => page !== home)
          const kept = new Set<Loose>([home, ...rest.slice(0, SITE_PAGE_MAX - 1)])
          value.pages = pages.filter((page) => kept.has(page))
          record('pages_trimmed', 'pages')
        } else {
          value.pages = pages
        }
      }

      if (isRecord(value.meta) && blank(value.meta.name)) {
        value.meta.name = siteName || (lang === 'tr' ? 'Yeni Site' : 'New Site')
        record('field_defaulted', 'meta.name')
      }
      if (isRecord(value.navigation) && 'logoText' in value.navigation && blank(value.navigation.logoText)) {
        value.navigation.logoText = isRecord(value.meta) && !blank(value.meta.name) ? value.meta.name : siteName
        record('field_defaulted', 'navigation.logoText')
      }
      return value
    },

    defaultFor(path: FieldPath, root: unknown) {
      const key = path[path.length - 1]
      const joined = path.filter((p) => typeof p === 'string').join('.')
      const meta = isRecord(root) && isRecord(root.meta) ? root.meta : null

      if (joined === 'meta.name') return siteName || (lang === 'tr' ? 'Yeni Site' : 'New Site')
      if (joined === 'meta.language') return lang
      if (joined === 'meta.tagline' || joined === 'meta.description') return ''
      if (joined === 'navigation.logoText') return typeof meta?.name === 'string' && meta.name ? meta.name : siteName
      if (joined === 'theme.mode') return 'light'
      if (joined === 'theme.radius') return 'medium'
      if (joined === 'typography.headingFont' || joined === 'typography.bodyFont') return 'Inter'
      if (path[0] === 'pages' && key === 'title') {
        const page = getPage(root, path[1])
        return titleFromSlug(page?.slug, lang)
      }
      if (path[0] === 'pages' && key === 'slug') return typeof path[1] === 'number' && path[1] === 0 ? 'home' : `page-${path[1]}`
      if (path[0] === 'sections' && (key === 'title' || key === 'heading')) {
        const section = isRecord(root) && Array.isArray(root.sections) ? root.sections[path[1] as number] : null
        return isRecord(section) ? SECTION_TITLES[section.type as SectionType]?.[lang] : undefined
      }
      if (key === 'label') return lang === 'tr' ? 'Daha fazla' : 'Learn more'
      if (key === 'href') return '#'
      return undefined
    },
  }
}

function getPage(root: unknown, index: string | number | undefined): Loose | null {
  if (!isRecord(root) || !Array.isArray(root.pages) || typeof index !== 'number') return null
  const page = root.pages[index]
  return isRecord(page) ? page : null
}

export type { RepairCode }

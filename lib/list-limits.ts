/**
 * Single source for how many entries each list section may hold. The website
 * schema reads these numbers for `.min()/.max()`, and the edit operations and
 * the editor read the same numbers to decide whether an entry can be added or
 * removed, so an edit can never produce a list the schema rejects.
 *
 * Leaf module: it imports nothing, so schema, ops and UI can all depend on it.
 */

export const ANNOUNCEMENT_MAX_ITEMS = 5

/** Gallery: images, albums that group them, and videos a section may hold. */
export const GALLERY_IMAGES_MAX = 60
export const GALLERY_ALBUMS_MAX = 12
export const GALLERY_VIDEOS_MAX = 12
export const GALLERY_ALBUM_NAME_MAX = 40
export const GALLERY_VIDEO_NAME_MAX = 80

/** "Slider Altı Kutu" strip: exactly four fixed boxes, with short copy. */
export const HERO_STRIP_ITEM_COUNT = 4
export const HERO_STRIP_TITLE_MAX = 30
export const HERO_STRIP_TEXT_MAX = 50

export type ListLimit = { readonly min: number; readonly max: number }

/**
 * A corporate site keeps its products inline in the schema (like portfolio or
 * services), so it may hold more than the 12 a store showcase carries. The schema
 * accepts the larger number; stores keep `LIST_LIMITS.products` through the edit ops.
 */
export const PRODUCT_CATALOG_LIMIT: ListLimit = { min: 1, max: 40 }
/** Images an owner can keep per product (first one is the cover). */
export const PRODUCT_IMAGES_MAX = 5
/** The schema still accepts what earlier saves may hold; the renderer and edit ops cap at PRODUCT_IMAGES_MAX. */
export const PRODUCT_IMAGES_STORED_MAX = 6
/** Home-page product counts an inline catalog can pick from; also the default-on threshold when unset. */
export const PRODUCT_HOME_DEFAULT_LIMIT = 8
export const PRODUCT_SPECS_MAX = 20

export const LIST_LIMITS = {
  slider: { min: 1, max: 8 },
  heroSlides: { min: 1, max: 6 },
  services: { min: 1, max: 8 },
  features: { min: 1, max: 8 },
  stats: { min: 1, max: 6 },
  pricing: { min: 1, max: 4 },
  testimonials: { min: 1, max: 24 },
  gallery: { min: 1, max: GALLERY_IMAGES_MAX },
  portfolio: { min: 1, max: 9 },
  products: { min: 1, max: 12 },
  categories: { min: 1, max: 8 },
  process: { min: 1, max: 6 },
  team: { min: 1, max: 8 },
  faq: { min: 1, max: 10 },
  announcement: { min: 1, max: ANNOUNCEMENT_MAX_ITEMS },
  heroStrip: { min: HERO_STRIP_ITEM_COUNT, max: HERO_STRIP_ITEM_COUNT },
} as const satisfies Record<string, ListLimit>

/**
 * How many entries the AI should aim for when it writes a section. This is a
 * suggestion for generation prompts, deliberately separate from LIST_LIMITS:
 * the limits say what the schema accepts (and what an owner may trim down to),
 * these say what reads well on a fresh site.
 */
export const AI_SUGGESTED_COUNTS = {
  services: { min: 3, max: 6 },
  features: { min: 4, max: 6 },
  stats: { min: 3, max: 4 },
  gallery: { min: 6, max: 9 },
  portfolio: { min: 3, max: 6 },
  products: { min: 4, max: 8 },
  categories: { min: 4, max: 6 },
  process: { min: 3, max: 4 },
  faq: { min: 4, max: 6 },
} as const satisfies Partial<Record<keyof typeof LIST_LIMITS, ListLimit>>

export type LimitedSectionType = Exclude<keyof typeof LIST_LIMITS, 'heroSlides'>

export function listLimitFor(sectionType: string): ListLimit | null {
  return Object.prototype.hasOwnProperty.call(LIST_LIMITS, sectionType) && sectionType !== 'heroSlides'
    ? LIST_LIMITS[sectionType as LimitedSectionType]
    : null
}

export function canRemoveEntry(sectionType: string, count: number): boolean {
  const limit = listLimitFor(sectionType)
  return limit ? count > limit.min : count > 1
}

export function canAddEntry(sectionType: string, count: number): boolean {
  const limit = listLimitFor(sectionType)
  return limit ? count < limit.max : true
}

/** Short Turkish/English reason shown next to a disabled add/remove button. */
export function limitReason(
  sectionType: string,
  kind: 'remove' | 'add',
  lang: 'tr' | 'en' = 'tr',
): string | null {
  const limit = listLimitFor(sectionType)
  if (!limit) return null
  if (kind === 'remove') {
    return lang === 'tr'
      ? `Bu bölümde en az ${limit.min} öğe kalmalı.`
      : `This section needs at least ${limit.min} items.`
  }
  return lang === 'tr'
    ? `Bu bölümde en fazla ${limit.max} öğe olabilir.`
    : `This section can hold at most ${limit.max} items.`
}

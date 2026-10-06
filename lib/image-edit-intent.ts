import { fold, describeVisualRequest } from './visual-subjects'
import { collectionOf, IMAGE_ITEM_SECTIONS } from './website-edit-operations'
import type { WebsiteSchema, SectionType, Section } from './website-schema'

/**
 * General image/logo edit intent detection (FAZ 3B)
 * ---------------------------------------------------
 * `detectHeroImageIntent` (visual-subjects.ts) only ever recognised the
 * HERO image, so "hizmetler bölümündeki fotoğrafı değiştir" or "logomu
 * yenile" fell straight through to the whole-site AI editor — which is
 * instructed to leave every image `src` untouched, so nothing visibly
 * happened. This module generalises that detection to every image-bearing
 * target on the site (hero, slider slides, section collection items, logo)
 * and to image REMOVAL, using the live site schema to resolve which section
 * and item the user means.
 *
 * Pure and client-safe: no server-only imports, so both the editor UI and
 * the `/api/edit` route (for combined text+image instructions) can share it.
 */

const IMAGE_WORDS = /(gorsel|resim|fotograf|foto|image|photo|picture|banner|slayt|kapak)/
const LOGO_WORDS = /(logo|marka amblem|amblem|brand mark)/
const REMOVE_WORDS = /(kaldir|sil\b|cikar|remove|delete)/
const CHANGE_WORDS =
  /(degistir|guncelle|yenile|olustur|tasarla|ekle|koy|yap|uret|modernle|change|replace|update|regenerate|generate|create|design|swap|refresh)/
const HERO_WORDS = /(ana|hero|kapak|ust|birinci|slider|slayt|main|header|banner)/
const OTHER_SECTION_HINT =
  /(hizmet|service|hakkimizda|about|yorum|referans|testimonial|fiyat|pricing|iletisim|contact|sss|faq)/

/** Section keyword → schema section type. Order matters: first match wins. */
const SECTION_KEYWORDS: Array<[SectionType, RegExp]> = [
  ['gallery', /(galeri|gallery)/],
  ['portfolio', /(portf[oö]y|portfolio|proje\b)/],
  ['team', /(ekip|takim|team)/],
  ['products', /(urun|product)/],
  ['categories', /(kategori|category)/],
  ['services', /(hizmet|service)/],
  ['slider', /(slayt|slider|slide)/],
]

const ORDINAL_WORDS: Array<[RegExp, number]> = [
  [/(\bbirinci\b|\bilk\b|\b1\.)/, 0],
  [/(\bikinci\b|\b2\.)/, 1],
  [/(\bucuncu\b|\b3\.)/, 2],
  [/(\bdorduncu\b|\b4\.)/, 3],
  [/(\bbesinci\b|\b5\.)/, 4],
]

function detectOrdinal(folded: string): number | null {
  for (const [re, idx] of ORDINAL_WORDS) if (re.test(folded)) return idx
  return null
}

/**
 * True when the clause mentions an image/photo/banner or the logo at all —
 * used to split a combined "change the title AND change the image"
 * instruction into its text and image clauses (see `applyEdit`'s combined-
 * instruction handling) without re-running the full intent detector twice.
 */
export function hasImageMention(text: string): boolean {
  const folded = fold(text)
  return IMAGE_WORDS.test(folded) || LOGO_WORDS.test(folded)
}

export type ImageEditTarget =
  | { kind: 'hero'; slideIndex?: number }
  | { kind: 'section'; sectionIndex: number; itemIndex: number; sectionType: SectionType }
  | { kind: 'logo' }

export type ImageEditIntent = {
  target: ImageEditTarget
  action: 'generate' | 'remove'
  /** Freeform visual description for 'generate'. Empty when more detail is needed. */
  request: string
}

/** Strips command scaffolding so only the freeform visual description remains. */
function extractRequest(instruction: string): string {
  return instruction
    .replace(/^(lutfen|please)\s+/i, '')
    .replace(
      /\b(ana|hero|kapak|slider|slayt|main|header|banner|logo|marka|amblem)\s*(g[öo]rsel\w*|resm\w*|foto\w*|image|photo|picture)?\s*(i[çc]in|for)?\b/gi,
      ' ',
    )
    .replace(
      /\b(ile\s+)?(de[ğg]i[şs]tir\w*|g[üu]ncelle\w*|yenile\w*|olu[şs]tur\w*|tasarla\w*|yap\w*|[üu]ret\w*|modernle[şs]tir\w*|change|replace|update|regenerate|generate|create|design|refresh)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function heroOf(site: WebsiteSchema) {
  return site.sections.find((s) => s.type === 'hero') as
    | Extract<Section, { type: 'hero' }>
    | undefined
}

/**
 * Detects an image/logo edit intent (generate or remove) from a natural
 * language instruction, resolving the target against the LIVE site schema.
 * Returns `null` when the instruction isn't about an image at all, so the
 * caller can continue with its normal text-edit pipeline.
 */
export function detectImageEditIntent(
  instruction: string,
  site: WebsiteSchema,
): ImageEditIntent | null {
  const folded = fold(instruction)
  const isLogo = LOGO_WORDS.test(folded)
  const isImage = IMAGE_WORDS.test(folded)
  if (!isLogo && !isImage) return null

  const isRemove = REMOVE_WORDS.test(folded)
  if (!isRemove && !CHANGE_WORDS.test(folded)) return null
  const action: 'generate' | 'remove' = isRemove ? 'remove' : 'generate'
  const request = action === 'remove' ? '' : extractRequest(instruction)

  if (isLogo) {
    return { target: { kind: 'logo' }, action, request }
  }

  // Section match — checked before the hero fallback so "hizmetler
  // bölümündeki fotoğrafı değiştir" is never mistaken for a hero edit.
  for (const [type, re] of SECTION_KEYWORDS) {
    if (!re.test(folded)) continue
    if (!IMAGE_ITEM_SECTIONS.includes(type)) continue
    const sectionIndex = site.sections.findIndex((s) => s.type === type)
    if (sectionIndex === -1) continue
    const list = collectionOf(site.sections[sectionIndex])
    if (!list || list.length === 0) continue
    const ordinal = detectOrdinal(folded)
    const itemIndex = ordinal !== null && ordinal < list.length ? ordinal : 0
    return {
      target: { kind: 'section', sectionIndex, itemIndex, sectionType: type },
      action,
      request,
    }
  }

  // Hero / slider fallback: explicit hero wording, or no other section named
  // (a bare "görseli değiştir" defaults to the hero, mirroring the previous
  // hero-only detector's behaviour).
  const hero = heroOf(site)
  if (hero && (HERO_WORDS.test(folded) || !OTHER_SECTION_HINT.test(folded))) {
    const slides = hero.slides ?? []
    let slideIndex: number | undefined
    if (slides.length > 1) {
      const ordinal = detectOrdinal(folded)
      if (ordinal !== null && ordinal < slides.length) slideIndex = ordinal
    }
    return { target: { kind: 'hero', slideIndex }, action, request }
  }

  return null
}

/** Short, human-readable label for a resolved target — used in chat feedback. */
export function describeImageTarget(target: ImageEditTarget, lang: 'tr' | 'en'): string {
  if (target.kind === 'logo') return lang === 'tr' ? 'logo' : 'the logo'
  if (target.kind === 'hero') return lang === 'tr' ? 'hero görseli' : 'the hero image'
  return lang === 'tr' ? `${target.sectionType} bölümündeki görsel` : `the image in the ${target.sectionType} section`
}

/**
 * Removes the image at `target` — a pure, non-AI operation (no generation, no
 * gate/credit spend). Unknown/missing targets are a no-op, returning `site`
 * unchanged.
 */
export function removeImageAtTarget(site: WebsiteSchema, target: ImageEditTarget): WebsiteSchema {
  const next: WebsiteSchema = JSON.parse(JSON.stringify(site))

  if (target.kind === 'logo') {
    next.navigation.logo = undefined
    return next
  }

  if (target.kind === 'hero') {
    const hero = heroOf(next)
    if (!hero) return next
    if (typeof target.slideIndex === 'number') {
      const slide = hero.slides?.[target.slideIndex]
      if (slide?.image) slide.image.src = undefined
    } else {
      if (hero.image) hero.image.src = undefined
      for (const slide of hero.slides ?? []) {
        if (slide.image) slide.image.src = undefined
      }
    }
    return next
  }

  const section = next.sections[target.sectionIndex]
  const list = collectionOf(section)
  const item = list?.[target.itemIndex]
  if (item && 'src' in item) item.src = undefined
  return next
}

// Re-exported so callers that already import from here don't also need
// visual-subjects.ts for the common "describe the freeform request" step.
export { describeVisualRequest }

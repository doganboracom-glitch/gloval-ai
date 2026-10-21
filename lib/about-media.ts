import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { detectSector, type Sector } from '@/lib/sector-profiles'

/**
 * About-section imagery
 * ---------------------
 * The about section grew an optional `media` block instead of a new section
 * type, so the 12-section cap is untouched and every stored site stays valid:
 * no `media` simply means the legacy text-only layout. Everything here is pure
 * (no server imports) so the renderer, the editor and the generation pipeline
 * share ONE definition of "which layout is actually showable".
 */

export const ABOUT_LAYOUTS = ['corner', 'collage', 'round'] as const
export type AboutLayout = (typeof ABOUT_LAYOUTS)[number]
export type AboutRenderLayout = AboutLayout | 'text'

export const MAX_ABOUT_IMAGES = 3

/**
 * The badge (small pill above the title) is a short label. The editor stops
 * new text at this length; the renderer shows one line and ellipsizes anything
 * longer, so stored labels that are already longer are never cut or rewritten.
 */
export const ABOUT_BADGE_MAX = 40

/** Largest badge length the editor accepts for a value: never shorter than what is already stored. */
export function aboutBadgeLimit(current: string): number {
  return Math.max(ABOUT_BADGE_MAX, current.length)
}

type AboutData = Extract<Section, { type: 'about' }>
export type AboutMedia = NonNullable<AboutData['media']>
export type AboutImage = NonNullable<AboutMedia['images']>[number]

type Lang = 'tr' | 'en'

export type ResolvedAbout = {
  layout: AboutRenderLayout
  images: { src: string; alt: string }[]
  label?: string
  cta?: { label: string; href: string }
}

const TEXT_ONLY: ResolvedAbout = { layout: 'text', images: [] }

export function isAboutLayout(value: unknown): value is AboutLayout {
  return typeof value === 'string' && (ABOUT_LAYOUTS as readonly string[]).includes(value)
}

/** Only absolute http(s), same-origin paths and image data URIs are rendered. */
export function isUsableImageSrc(src: unknown): src is string {
  if (typeof src !== 'string') return false
  const value = src.trim()
  if (!value) return false
  return /^https?:\/\//i.test(value) || value.startsWith('/') || /^data:image\//i.test(value)
}

/** Images that can really be drawn (have a src), capped at the panel limit. */
export function usableAboutImages(media: AboutMedia | undefined, fallbackAlt: string) {
  return (media?.images ?? [])
    .filter((image) => isUsableImageSrc(image.src))
    .slice(0, MAX_ABOUT_IMAGES)
    .map((image) => ({
      src: (image.src as string).trim(),
      alt: image.alt?.trim() || fallbackAlt,
    }))
}

/** Why a layout can or cannot be chosen right now: `collage` needs at least two images. */
export function layoutAvailability(
  layout: AboutLayout,
  imageCount: number,
): { available: boolean; reason?: 'needs-image' | 'needs-two-images' } {
  if (imageCount < 1) return { available: false, reason: 'needs-image' }
  if (layout === 'collage' && imageCount < 2) return { available: false, reason: 'needs-two-images' }
  return { available: true }
}

/**
 * What the renderer should draw. Anything that cannot be drawn cleanly (switch
 * off, no usable image, a layout missing its prerequisites) degrades to the
 * text layout or to the always-valid corner layout, never to an empty frame.
 */
export function resolveAboutMedia(data: AboutData, fallbackAlt: string): ResolvedAbout {
  const media = data.media
  if (!media || media.enabled === false) return TEXT_ONLY

  const images = usableAboutImages(media, fallbackAlt)
  if (images.length === 0) return TEXT_ONLY

  // A stored `figure` layout (removed) is not a known layout any more, so it lands on corner.
  let layout: AboutLayout = isAboutLayout(media.layout) ? media.layout : 'corner'
  if (!layoutAvailability(layout, images.length).available) layout = 'corner'

  const cta = media.cta?.label.trim() && media.cta.href.trim() ? media.cta : undefined
  return {
    layout,
    images,
    label: media.label?.trim() || undefined,
    cta,
  }
}

/* -------------------------------------------------------------------------- */
/*  Automatic layout choice                                                   */
/* -------------------------------------------------------------------------- */

const LAYOUT_BY_SECTOR: Record<Sector, AboutLayout> = {
  law: 'corner',
  tech: 'corner',
  architecture: 'corner',
  realestate: 'corner',
  automotive: 'corner',
  default: 'corner',
  photography: 'collage',
  food: 'collage',
  ecommerce: 'collage',
  dental: 'round',
  beauty: 'round',
}

export function pickAboutLayout(sector: Sector, imageCount: number): AboutLayout {
  const preferred = LAYOUT_BY_SECTOR[sector]
  return layoutAvailability(preferred, imageCount).available ? preferred : 'corner'
}

/* -------------------------------------------------------------------------- */
/*  Reusing images the site already has                                       */
/* -------------------------------------------------------------------------- */

type Candidate = { src: string; alt: string }

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Images the site already owns, in preference order: gallery-like items first
 * (so the about image is not a copy of the hero right above it), then hero
 * visuals. Free: nothing is generated or charged here.
 */
export function collectReusableImages(site: Pick<WebsiteSchema, 'sections' | 'meta'>): Candidate[] {
  const seen = new Set<string>()
  const out: Candidate[] = []
  const add = (src: unknown, alt: unknown) => {
    if (!isUsableImageSrc(src)) return
    const key = src.trim()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ src: key, alt: asText(alt) || site.meta.name })
  }

  for (const section of site.sections) {
    if (section.type !== 'gallery' && section.type !== 'portfolio' && section.type !== 'slider') continue
    const items = (section as { items?: unknown; slides?: unknown }).items ?? (section as { slides?: unknown }).slides
    if (!Array.isArray(items)) continue
    for (const item of items as Record<string, unknown>[]) {
      add(item.src, item.alt ?? item.title ?? item.caption)
    }
  }
  for (const section of site.sections) {
    if (section.type !== 'hero') continue
    add(section.image?.src, section.image?.alt)
    for (const slide of section.slides ?? []) add(slide.image?.src, slide.image?.alt ?? slide.title)
  }
  return out
}

function defaultCta(site: Pick<WebsiteSchema, 'sections'>, lang: Lang) {
  const hasContact = site.sections.some((s) => s.type === 'contact' && !s.hidden)
  if (!hasContact) return undefined
  return { label: lang === 'tr' ? 'İletişime geçin' : 'Get in touch', href: '#contact' }
}

/** Default badge text, written as it should read (the renderer no longer forces capitals). */
export function aboutLabel(lang: Lang) {
  return lang === 'tr' ? 'Biz Kimiz' : 'Who We Are'
}

const SECTOR_NOUN: Record<Sector, { tr: string; en: string }> = {
  law: { tr: 'hukuk bürosu', en: 'law firm' },
  tech: { tr: 'teknoloji şirketi', en: 'technology company' },
  architecture: { tr: 'mimarlık ofisi', en: 'architecture studio' },
  realestate: { tr: 'emlak ofisi', en: 'real estate agency' },
  automotive: { tr: 'otomotiv işletmesi', en: 'automotive business' },
  photography: { tr: 'fotoğraf stüdyosu', en: 'photography studio' },
  food: { tr: 'yeme içme mekanı', en: 'food and drink venue' },
  ecommerce: { tr: 'online mağaza', en: 'online store' },
  dental: { tr: 'diş kliniği', en: 'dental clinic' },
  beauty: { tr: 'güzellik salonu', en: 'beauty salon' },
  default: { tr: 'işletme', en: 'business' },
}

export function sectorNoun(sector: Sector, lang: Lang): string {
  return SECTOR_NOUN[sector][lang]
}

/** Business name + sector, e.g. "Denta Estetik - diş kliniği çalışma alanı". Never empty. */
export function suggestAboutAlt(
  site: Pick<WebsiteSchema, 'meta'>,
  title: string,
  lang: Lang,
  prompt = '',
): string {
  const name = site.meta.name.trim()
  const context = [prompt, name, site.meta.tagline, site.meta.audience].filter(Boolean).join(' ')
  const noun = sectorNoun(detectSector(context), lang)
  const scene = lang === 'tr' ? 'hakkında görseli' : 'about image'
  if (name) return `${name} - ${noun} ${scene}`
  return title.trim() ? `${title.trim()} - ${noun}` : `${noun} ${scene}`
}

/** Alt text is mandatory: any image saved without one gets the meaningful suggestion. */
export function withRequiredAlt<T extends { alt?: string }>(
  images: T[],
  site: Pick<WebsiteSchema, 'meta'>,
  title: string,
  lang: Lang,
): T[] {
  const fallback = suggestAboutAlt(site, title, lang)
  return images.map((image) => (image.alt?.trim() ? image : { ...image, alt: fallback }))
}

/**
 * Prompt for the about image. A place or workspace scene, never people: the
 * shared image rules (no text) still apply on top, and the explicit people ban
 * keeps faces and figures out of an image nobody has reviewed.
 */
export function buildAboutImagePrompt(
  site: Pick<WebsiteSchema, 'meta'>,
  prompt = '',
  request = '',
): string {
  const context = [prompt, site.meta.name, site.meta.tagline, site.meta.audience].filter(Boolean).join(' ')
  const sector = detectSector(context)
  const subject = request.trim() || `${SECTOR_NOUN[sector].en} of "${site.meta.name}"`
  return [
    `Photorealistic photograph of the workspace or premises of a ${SECTOR_NOUN[sector].en}: ${subject}.`,
    'Calm, well-lit environment scene showing tools, materials and interior details.',
    'No people, no faces, no hands, no human figures, no mannequins, no text, no logos.',
    'Natural light, shallow depth of field, high resolution, sharp focus.',
  ].join(' ')
}

/** Suggestion state for the editor: a published site is only ever nudged, never changed. */
export function aboutImageHint(
  site: Pick<WebsiteSchema, 'sections' | 'dismissedHints'>,
  published: boolean,
): 'none' | 'draft' | 'published' {
  if (!aboutLacksImage(site)) return 'none'
  if (published && site.dismissedHints?.includes('aboutImage')) return 'none'
  return published ? 'published' : 'draft'
}

/**
 * Gives every about section that has no `media` yet one, reusing images the
 * site already has. Sections that already carry `media` (including an owner's
 * explicit "off") are left alone. Returns the same object when nothing changes.
 */
export function seedAboutMedia<T extends Pick<WebsiteSchema, 'sections' | 'meta'>>(site: T, prompt = ''): T {
  const lang: Lang = site.meta.language === 'en' ? 'en' : 'tr'
  if (!site.sections.some((s) => s.type === 'about' && !s.media)) return site

  const candidates = collectReusableImages(site)
  const context = [prompt, site.meta.name, site.meta.tagline, site.meta.audience].filter(Boolean).join(' ')
  const sector = detectSector(context)

  const sections = site.sections.map((section) => {
    if (section.type !== 'about' || section.media) return section
    const images = candidates.slice(0, MAX_ABOUT_IMAGES).map((c) => ({ src: c.src, alt: c.alt, origin: 'reused' }))
    const media: AboutMedia = {
      enabled: true,
      layout: pickAboutLayout(sector, images.length),
      images,
      label: aboutLabel(lang),
      cta: defaultCta(site, lang),
    }
    return { ...section, media }
  })
  return { ...site, sections }
}

/** True when an about section has nothing to show yet and the owner has not turned images off. */
export function aboutLacksImage(site: Pick<WebsiteSchema, 'sections'>): boolean {
  return site.sections.some(
    (s) =>
      s.type === 'about' &&
      !(s.media && s.media.enabled === false) &&
      usableAboutImages(s.media, '').length === 0,
  )
}

/* -------------------------------------------------------------------------- */
/*  Compat normalization                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Keeps a stored `media` block inside its invariants (valid layout, at most 3
 * real images). Sites without `media` come back untouched, which is what keeps
 * legacy rows byte-identical.
 *
 * Backward compatibility for the removed "figure" layout: a row that still
 * carries a `figure` object (or the `figure` layout) has the number fields
 * ignored and dropped and its layout set to `corner`. No SQL migration needed.
 */
export function normalizeAboutMedia<T extends Pick<WebsiteSchema, 'sections'>>(site: T): T {
  if (!site.sections.some((s) => s.type === 'about' && s.media)) return site

  let changed = false
  const sections = site.sections.map((section) => {
    if (section.type !== 'about' || !section.media) return section
    const { figure: legacyFigure, ...media } = section.media as AboutMedia & { figure?: unknown }
    const images = (media.images ?? [])
      .filter((image) => isUsableImageSrc(image.src) || asText(image.imagePrompt))
      .slice(0, MAX_ABOUT_IMAGES)
    const legacyLayout = (media.layout as string | undefined) === 'figure'
    const layout = legacyLayout ? 'corner' : isAboutLayout(media.layout) ? media.layout : undefined

    const same =
      images.length === (media.images ?? []).length &&
      layout === media.layout &&
      legacyFigure === undefined
    if (same) return section
    changed = true
    const next: AboutMedia = { ...media, images, layout }
    return { ...section, media: next }
  })
  return changed ? { ...site, sections } : site
}

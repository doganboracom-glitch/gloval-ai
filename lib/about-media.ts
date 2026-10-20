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

export const ABOUT_LAYOUTS = ['corner', 'collage', 'round', 'figure'] as const
export type AboutLayout = (typeof ABOUT_LAYOUTS)[number]
export type AboutRenderLayout = AboutLayout | 'text'

export const MAX_ABOUT_IMAGES = 3

type AboutData = Extract<Section, { type: 'about' }>
export type AboutMedia = NonNullable<AboutData['media']>
export type AboutImage = NonNullable<AboutMedia['images']>[number]
export type AboutFigure = NonNullable<AboutMedia['figure']>

type Lang = 'tr' | 'en'

export type ResolvedAbout = {
  layout: AboutRenderLayout
  images: { src: string; alt: string }[]
  label?: string
  figure?: AboutFigure
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

export function hasRealFigure(figure: AboutMedia['figure']): figure is AboutFigure {
  return !!figure && figure.value.trim().length > 0 && figure.label.trim().length > 0
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

/**
 * Why a layout can or cannot be chosen right now. `figure` is only available
 * with a figure the OWNER supplied; `collage` needs at least two images.
 */
export function layoutAvailability(
  layout: AboutLayout,
  imageCount: number,
  figure: AboutMedia['figure'],
): { available: boolean; reason?: 'needs-image' | 'needs-two-images' | 'needs-figure' } {
  if (imageCount < 1) return { available: false, reason: 'needs-image' }
  if (layout === 'collage' && imageCount < 2) return { available: false, reason: 'needs-two-images' }
  if (layout === 'figure' && !hasRealFigure(figure)) return { available: false, reason: 'needs-figure' }
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

  let layout: AboutLayout = isAboutLayout(media.layout) ? media.layout : 'corner'
  if (!layoutAvailability(layout, images.length, media.figure).available) layout = 'corner'

  const cta = media.cta?.label.trim() && media.cta.href.trim() ? media.cta : undefined
  return {
    layout,
    images,
    label: media.label?.trim() || undefined,
    figure: layout === 'figure' && hasRealFigure(media.figure) ? media.figure : undefined,
    cta,
  }
}

/* -------------------------------------------------------------------------- */
/*  Real figures (never invented)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Pulls a founding year or a project/customer count out of what the customer
 * actually wrote. Returns null when nothing is stated: the figure layout then
 * stays unavailable and no number is ever made up.
 */
export function extractRealFigure(text: string, lang: Lang, now = new Date()): AboutFigure | null {
  const source = text.toLocaleLowerCase('tr')
  const maxYear = now.getFullYear()
  const validYear = (raw: string | undefined) => {
    const year = Number(raw)
    return Number.isInteger(year) && year >= 1900 && year <= maxYear ? String(year) : null
  }

  const yearPatterns = [
    /(?:^|[^\d])((?:19|20)\d{2})['’]?\s*(?:y[ıi]l[ıi]ndan\s*)?(?:den|dan|ten|tan)?\s*beri/,
    /kurulu[sş]\s*(?:y[ıi]l[ıi])?\s*[:\-]?\s*((?:19|20)\d{2})/,
    /((?:19|20)\d{2})\s*y[ıi]l[ıi]nda\s*kuruldu/,
    /(?:since|founded in|established in|est\.?)\s*((?:19|20)\d{2})/,
  ]
  for (const pattern of yearPatterns) {
    const year = validYear(source.match(pattern)?.[1])
    if (year) return { value: year, label: lang === 'tr' ? 'Kuruluş yılı' : 'Founded' }
  }

  const count = source.match(
    /(\d[\d.,]*)\s*(\+)?\s*(?:adet\s+)?(?:tamamlanan\s+|mutlu\s+)?(proje|projects?|m[uü][sş]teri|clients?|customers?)/,
  )
  if (count) {
    const digits = count[1].replace(/[.,]/g, '')
    const amount = Number(digits)
    if (Number.isInteger(amount) && amount >= 10 && amount <= 1_000_000) {
      const isProject = /^proje|^project/.test(count[3])
      const formatted = amount.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')
      return {
        value: `${formatted}${count[2] ? '+' : ''}`,
        label: isProject
          ? lang === 'tr' ? 'Tamamlanan proje' : 'Projects completed'
          : lang === 'tr' ? 'Mutlu müşteri' : 'Happy customers',
      }
    }
  }
  return null
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

const FIGURE_FRIENDLY: ReadonlySet<Sector> = new Set<Sector>([
  'law',
  'tech',
  'architecture',
  'realestate',
  'automotive',
  'default',
])

export function pickAboutLayout(
  sector: Sector,
  imageCount: number,
  figure: AboutMedia['figure'],
): AboutLayout {
  const preferred =
    hasRealFigure(figure) && FIGURE_FRIENDLY.has(sector) ? 'figure' : LAYOUT_BY_SECTOR[sector]
  return layoutAvailability(preferred, imageCount, figure).available ? preferred : 'corner'
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

function aboutLabel(lang: Lang) {
  return lang === 'tr' ? 'Biz kimiz' : 'Who we are'
}

/** A starter alt text from the site's own words (editable; never empty). */
export function suggestAboutAlt(site: Pick<WebsiteSchema, 'meta'>, title: string, lang: Lang): string {
  const name = site.meta.name.trim()
  const about = title.trim()
  if (name && about) return lang === 'tr' ? `${name} - ${about}` : `${name} - ${about}`
  return name || about
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
  const figure = extractRealFigure(`${prompt} ${site.meta.tagline ?? ''}`, lang) ?? undefined

  const sections = site.sections.map((section) => {
    if (section.type !== 'about' || section.media) return section
    const images = candidates.slice(0, MAX_ABOUT_IMAGES).map((c) => ({ src: c.src, alt: c.alt, origin: 'reused' }))
    const media: AboutMedia = {
      enabled: true,
      layout: pickAboutLayout(sector, images.length, figure),
      images,
      label: aboutLabel(lang),
      figure,
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
 * real images, a figure only when it holds a value). Sites without `media`
 * come back untouched, which is what keeps legacy rows byte-identical.
 */
export function normalizeAboutMedia<T extends Pick<WebsiteSchema, 'sections'>>(site: T): T {
  if (!site.sections.some((s) => s.type === 'about' && s.media)) return site

  let changed = false
  const sections = site.sections.map((section) => {
    if (section.type !== 'about' || !section.media) return section
    const media = section.media
    const images = (media.images ?? [])
      .filter((image) => isUsableImageSrc(image.src) || asText(image.imagePrompt))
      .slice(0, MAX_ABOUT_IMAGES)
    const figure = hasRealFigure(media.figure) ? media.figure : undefined
    let layout = isAboutLayout(media.layout) ? media.layout : undefined
    if (layout === 'figure' && !figure) layout = 'corner'

    const next: AboutMedia = { ...media, images, figure, layout }
    const same =
      images.length === (media.images ?? []).length &&
      figure === media.figure &&
      layout === media.layout
    if (same) return section
    changed = true
    return { ...section, media: next }
  })
  return changed ? { ...site, sections } : site
}

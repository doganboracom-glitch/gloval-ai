import type { HeroLayout } from '@/lib/hero-layout'
import { LIST_LIMITS } from '@/lib/list-limits'
import type { Section, WebsiteSchema } from '@/lib/website-schema'

type HeroData = Extract<Section, { type: 'hero' }>
export type HeroSlideData = NonNullable<HeroData['slides']>[number]

export const HERO_UPLOAD_MAX_BYTES = 5 * 1024 * 1024
export const HERO_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type HeroUploadCheck = { ok: true } | { ok: false; reason: 'type' | 'size' }

/** Client-side gate for the hero image upload: png/jpg/webp, at most 5 MB. */
export function validateHeroUpload(file: { type: string; size: number }): HeroUploadCheck {
  if (!(HERO_UPLOAD_TYPES as readonly string[]).includes(file.type)) return { ok: false, reason: 'type' }
  if (file.size > HERO_UPLOAD_MAX_BYTES) return { ok: false, reason: 'size' }
  return { ok: true }
}

export const HERO_SLIDE_MIN = LIST_LIMITS.heroSlides.min
export const HERO_SLIDE_MAX = LIST_LIMITS.heroSlides.max

export type HeroSizeHint = { width: number; height: number; note: 'standard' | 'side' | 'cover' }

/** Recommended artwork size per hero style, shown next to the image controls. */
export function recommendedHeroSize(layout: HeroLayout): HeroSizeHint {
  switch (layout) {
    case 'light-cover':
      return { width: 1200, height: 1400, note: 'side' }
    case 'full-bleed':
      return { width: 1920, height: 1080, note: 'cover' }
    default:
      return { width: 1200, height: 800, note: 'standard' }
  }
}

/** One editable slide: the real slides when present, else the hero itself as slide 1. */
export type HeroSlideView = {
  title: string
  description: string
  buttonLabel: string
  buttonHref: string
  image: { src?: string; alt?: string; imagePrompt?: string } | undefined
}

export function heroSlideViews(hero: HeroData): HeroSlideView[] {
  if (hero.slides && hero.slides.length > 0) {
    return hero.slides.map((s) => ({
      title: s.title,
      description: s.description ?? '',
      buttonLabel: s.primaryButton?.label ?? '',
      buttonHref: s.primaryButton?.href ?? '',
      image: s.image,
    }))
  }
  return [
    {
      title: hero.title,
      description: hero.description,
      buttonLabel: hero.primaryButton?.label ?? '',
      buttonHref: hero.primaryButton?.href ?? '',
      image: hero.image,
    },
  ]
}

/** Alt text is required for a published image, so the editor flags any image without it. */
export function slideMissingAlt(view: HeroSlideView): boolean {
  return Boolean(view.image?.src) && !(view.image?.alt ?? '').trim()
}

export function heroMissingAltCount(hero: HeroData): number {
  return heroSlideViews(hero).filter(slideMissingAlt).length
}

export type HeroLinkOption = { label: string; href: string }

/** Link targets the owner can pick from: site pages first, then page anchors. */
export function heroLinkOptions(site: WebsiteSchema): HeroLinkOption[] {
  const options: HeroLinkOption[] = []
  for (const page of site.pages ?? []) {
    options.push({ label: page.title, href: page.isHome ? '/' : `/${page.slug}` })
  }
  return options
}

/** Every image already on the site, de-duplicated, so a slide can reuse one. */
export function collectSiteImages(site: WebsiteSchema): { src: string; alt: string }[] {
  const seen = new Set<string>()
  const out: { src: string; alt: string }[] = []
  const push = (img?: { src?: string; alt?: string }) => {
    const src = img?.src
    if (!src || seen.has(src)) return
    seen.add(src)
    out.push({ src, alt: img?.alt ?? '' })
  }
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 6) return
    if (Array.isArray(value)) {
      for (const v of value) visit(v, depth + 1)
      return
    }
    const rec = value as Record<string, unknown>
    if (typeof rec.src === 'string' && typeof rec.imagePrompt === 'string') push(rec as { src: string })
    for (const v of Object.values(rec)) visit(v, depth + 1)
  }
  visit(site.sections, 0)
  return out
}

/** Accepts anchors, site paths, http(s), mailto and tel; rejects script-like schemes. */
export function isSafeHeroHref(href: string): boolean {
  const value = href.trim()
  if (!value) return true
  if (/^(#|\/(?!\/)|https?:\/\/|mailto:|tel:)/i.test(value)) return true
  return false
}

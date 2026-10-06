import { detectSector, type Sector } from '@/lib/sector-profiles'
import type { WebsiteSchema, SiteImageRef } from '@/lib/website-schema'
import {
  generateSiteImage,
  imageGenerationAvailable,
  type ImageAspect,
} from '@/lib/image-provider'
import { persistImageDataUri } from '@/lib/image-storage'
import { describeVisualRequest, resolveVisualTopic } from '@/lib/visual-subjects'

/**
 * Hero image intelligence
 * -----------------------
 * Turns the user's freeform site-creation brief into a DYNAMIC, brief-specific
 * image prompt for the hero/slider — instead of hardcoding a handful of static
 * sector images. It extracts the signals a good image needs (sector, business
 * type, style, audience, visual need) and composes a single descriptive prompt,
 * then (best-effort) resolves it to a real image via the server-side provider.
 */

export type Brief = {
  sector: Sector
  businessType: string
  style: string
  audience: string
  visualNeed: string
}

/** The concrete subject each sector's hero image should depict. */
const SECTOR_SUBJECT: Record<Sector, string> = {
  dental: 'a bright, modern dental clinic interior with clean equipment and a calm, welcoming reception area',
  food: 'an inviting restaurant scene with beautifully plated gourmet dishes on a wooden table and warm ambient light',
  law: 'a prestigious law-office interior with rich bookshelves, an elegant desk and floor-to-ceiling city windows',
  architecture: 'a striking contemporary building with bold geometry, glass and concrete under dramatic natural light',
  beauty: 'a serene, luxurious spa and beauty salon interior with soft lighting and refined styling stations',
  tech: 'a sleek futuristic tech workspace with abstract holographic data visualization and subtle glowing accents',
  ecommerce: 'an elegant product flat-lay of premium retail goods arranged on a clean, minimal studio backdrop',
  photography: 'a professional photography studio with dramatic directional lighting and a creative editorial composition',
  automotive: 'a premium automotive dealership showroom with luxury cars under cinematic lighting, sleek and modern, professional automotive photography',
  realestate: 'a luxury modern house exterior at dusk with warm interior lights, a pool and contemporary architecture, premium real-estate photography',
  default: 'a clean, modern professional workspace that conveys trust, quality and craftsmanship',
}

/** A short human label for the detected business type. */
const SECTOR_BUSINESS: Record<Sector, string> = {
  dental: 'dental clinic',
  food: 'restaurant / cafe',
  law: 'law / consulting firm',
  architecture: 'architecture studio',
  beauty: 'beauty & wellness salon',
  tech: 'technology / SaaS company',
  ecommerce: 'online store / brand',
  photography: 'photography studio',
  automotive: 'car dealership / auto gallery',
  realestate: 'real estate agency',
  default: 'professional business',
}

/**
 * Derives a compact style descriptor from the brief + the (already generated)
 * theme so the image matches the site's tone and light/dark mood.
 */
function styleDescriptor(prompt: string, site?: WebsiteSchema): string {
  const parts: string[] = []
  if (site?.meta.tone) parts.push(site.meta.tone)

  const p = prompt.toLowerCase()
  const cues: Array<[RegExp, string]> = [
    [/lüks|luxury|premium|exclusive|elit/i, 'luxurious and premium'],
    [/minimal|sade|clean|modern/i, 'minimal and modern'],
    [/samimi|warm|cozy|sıcak|sicak/i, 'warm and inviting'],
    [/eğlen|fun|playful|renkli|colorful|vibrant/i, 'vibrant and energetic'],
    [/kurumsal|corporate|profesyonel|professional/i, 'polished and corporate'],
    [/doğa|dogal|natural|organic|eco/i, 'natural and organic'],
  ]
  for (const [re, label] of cues) {
    if (re.test(p)) parts.push(label)
  }
  if (parts.length === 0) parts.push('modern and professional')

  const lightMood =
    site?.theme.mode === 'dark' ? 'moody cinematic lighting' : 'bright, airy natural lighting'
  parts.push(lightMood)
  return Array.from(new Set(parts)).join(', ')
}

/**
 * Extracts the structured brief from the raw prompt (and optional site).
 *
 * Subject resolution is keyword-first, sector-second: `resolveVisualTopic`
 * covers hundreds of real businesses (nakliyat, temizlik, veteriner, tesisat,
 * …) that the coarse `Sector` list cannot express. Only when no keyword matches
 * do we fall back to the sector scene, and finally to the generic default. This
 * is why a moving company no longer gets an office-interior hero.
 */
export function analyzeBrief(prompt: string, site?: WebsiteSchema): Brief {
  const sector = detectSector(prompt)
  // The site's own signals are part of the brief: a site created earlier can be
  // re-analyzed from its name/tagline/audience even without the original text.
  const haystack = [
    prompt,
    site?.meta.name,
    site?.meta.tagline,
    site?.meta.audience,
    site?.navigation?.logoText,
  ]
    .filter(Boolean)
    .join(' ')
  const topic = resolveVisualTopic(haystack)

  return {
    sector,
    businessType: topic?.business ?? SECTOR_BUSINESS[sector],
    style: styleDescriptor(prompt, site),
    audience: site?.meta.audience || 'a broad, quality-seeking audience',
    visualNeed: topic?.subject ?? SECTOR_SUBJECT[sector],
  }
}

/**
 * Composes the final image prompt from the brief. The prompt is fully dynamic:
 * it reflects the actual user request, the site's tone and the audience, rather
 * than selecting from a fixed set of canned images.
 */
export function buildHeroImagePrompt(brief: Brief, extra?: string): string {
  // SUBJECT FIRST: fast diffusion models weight the opening tokens most
  // heavily, so leading with the scene (instead of "Professional hero banner
  // photograph for a …") is what keeps the result on-topic.
  const bits = [
    `${brief.visualNeed}.`,
    `Photorealistic hero banner photograph for a ${brief.businessType}.`,
    `Style: ${brief.style}.`,
    extra ? `Context: ${extra}.` : '',
    'Wide cinematic composition with clear negative space for overlaid text,',
    'high resolution, sharp focus, realistic documentary photography,',
    'no text, no watermark, no logos, no collage, not an empty landscape.',
  ]
  return bits.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Composes a hero image prompt from an EXPLICIT user request
 * ("kamyonete ürün yükleyen personelli bir görsel"). The request drives the
 * subject; the site only contributes tone/lighting so the new image still fits
 * the design. Turkish wording is mapped to English visual vocabulary first
 * (see `describeVisualRequest`) because image models are English-centric.
 */
export function buildRequestedImagePrompt(request: string, site?: WebsiteSchema): string {
  const subject = describeVisualRequest(request)
  const brief = analyzeBrief(
    `${request} ${site?.meta.name ?? ''} ${site?.meta.tagline ?? ''}`,
    site,
  )
  return [
    `${subject}.`,
    `Photorealistic hero banner photograph for a ${brief.businessType}.`,
    `Style: ${brief.style}.`,
    'Wide cinematic composition with clear negative space for overlaid text,',
    'high resolution, sharp focus, realistic documentary photography,',
    'no text, no watermark, no logos, no collage, not an empty landscape.',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Carries already-resolved image URLs from a previous schema into a newly
 * generated one.
 *
 * The AI editor returns a COMPLETE rewritten schema, and LLMs routinely omit
 * long `src` values (data URIs / blob URLs) — which is exactly why the hero
 * image "disappeared" after an unrelated text edit. This restores any `src`
 * the new schema is missing, without overriding one the edit deliberately set.
 *
 * Pure and defensive: unknown shapes are left untouched.
 */
export function preserveResolvedImages(
  previous: WebsiteSchema,
  next: WebsiteSchema,
): WebsiteSchema {
  const heroOf = (site: WebsiteSchema) =>
    site.sections.find((s) => s.type === 'hero') as
      | Extract<WebsiteSchema['sections'][number], { type: 'hero' }>
      | undefined

  const prevHero = heroOf(previous)
  const nextHero = heroOf(next)
  if (!prevHero || !nextHero) return next

  // Any previously resolved hero/slide image is a valid source to fall back on.
  const inherited =
    prevHero.image?.src || prevHero.slides?.find((s) => s.image?.src)?.image?.src

  if (inherited) {
    if (nextHero.image && !nextHero.image.src) nextHero.image.src = inherited
    else if (!nextHero.image) {
      nextHero.image = {
        imagePrompt: prevHero.image?.imagePrompt ?? next.meta.name,
        src: inherited,
        alt: prevHero.image?.alt,
        aspectRatio: prevHero.image?.aspectRatio ?? '16/9',
      }
    }
    for (const slide of nextHero.slides ?? []) {
      if (slide.image && !slide.image.src) slide.image.src = inherited
    }
  }

  // Gallery / portfolio / team images are matched positionally — the safest
  // heuristic when the AI may have reordered or reworded captions.
  const carry = (
    prevItems: Array<{ src?: string }> | undefined,
    nextItems: Array<{ src?: string }> | undefined,
  ) => {
    if (!prevItems || !nextItems) return
    nextItems.forEach((item, i) => {
      if (!item.src && prevItems[i]?.src) item.src = prevItems[i].src
    })
  }

  for (const type of ['gallery', 'portfolio', 'team'] as const) {
    const prevSection = previous.sections.find((s) => s.type === type)
    const nextSection = next.sections.find((s) => s.type === type)
    if (!prevSection || !nextSection) continue
    if (type === 'team' && 'members' in prevSection && 'members' in nextSection) {
      carry(prevSection.members, nextSection.members)
    } else if ('items' in prevSection && 'items' in nextSection) {
      carry(prevSection.items as Array<{ src?: string }>, nextSection.items as Array<{ src?: string }>)
    }
  }

  return next
}

export type HeroImageOutcome = {
  /** 'generated' | 'linked' (direct URL) | 'failed' | 'skipped' (no provider). */
  status: 'generated' | 'linked' | 'failed' | 'skipped'
  /** The prompt that was stored on the hero image. */
  imagePrompt: string
}

/**
 * Replaces the hero (and first slide) image from an explicit user request —
 * the single path used by BOTH the "AI ile düzenle" chat and the manual hero
 * image control in the design panel.
 *
 * Two modes:
 *  - a direct image URL ("https://…") is linked as-is (fully manual control),
 *  - anything else is treated as a visual description and generated.
 *
 * Only image fields are touched, so text, colors and layout stay identical.
 */
export async function applyHeroImageRequest(
  site: WebsiteSchema,
  request: string,
): Promise<HeroImageOutcome> {
  const hero = site.sections.find((s) => s.type === 'hero') as
    | Extract<WebsiteSchema['sections'][number], { type: 'hero' }>
    | undefined

  const trimmed = (request || '').trim()
  const brief = analyzeBrief(trimmed || site.meta.name, site)
  const imagePrompt = trimmed
    ? buildRequestedImagePrompt(trimmed, site)
    : buildHeroImagePrompt(brief, site.meta.tagline)

  if (!hero) return { status: 'failed', imagePrompt }

  const altBase =
    site.meta.language === 'tr'
      ? `${site.meta.name} tanıtım görseli`
      : `${site.meta.name} hero image`

  // The slider shows slides[0] first; every other variant shows hero.image.
  const slides = Array.isArray(hero.slides) ? hero.slides : []
  const variantIsSlider = hero.variant === 'slider' || (!hero.variant && slides.length > 1)

  // A direct URL is honoured verbatim — this is the manual escape hatch.
  const directUrl = /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null

  const targets: SiteImageRef[] = []
  const assign = (current: SiteImageRef | undefined): SiteImageRef => {
    const next: SiteImageRef = {
      ...(current ?? {}),
      imagePrompt: directUrl ? (current?.imagePrompt || imagePrompt) : imagePrompt,
      alt: current?.alt || altBase,
      aspectRatio: current?.aspectRatio ?? '16/9',
      // Keep the current image until a new one is really produced, so a failed
      // or skipped generation can never wipe the image the user already has.
      src: directUrl ?? current?.src,
    }
    targets.push(next)
    return next
  }

  hero.image = assign(hero.image)
  if (variantIsSlider && slides[0]) slides[0].image = assign(slides[0].image)

  if (directUrl) return { status: 'linked', imagePrompt }
  if (!imageGenerationAvailable()) return { status: 'skipped', imagePrompt }

  const res = await generateSiteImage({
    prompt: imagePrompt,
    aspectRatio: toProviderAspect(targets[0]?.aspectRatio),
  })
  if (!res) return { status: 'failed', imagePrompt }

  const src = await persistImageDataUri(res.src)
  for (const target of targets) target.src = src
  return { status: 'generated', imagePrompt }
}

/**
 * Replaces ONE slider slide's image from an explicit user request, leaving every
 * other slide (and all text/layout) untouched. This is what powers the
 * per-slide upload / AI-generate controls in the design panel when a hero uses
 * the `slider` variant with more than one slide.
 *
 * Mirrors `applyHeroImageRequest`'s two modes (direct URL vs generated prompt),
 * and keeps `hero.image` in sync when the first slide changes, since the slider
 * shows `slides[0]` first.
 */
export async function applySlideImageRequest(
  site: WebsiteSchema,
  slideIndex: number,
  request: string,
): Promise<HeroImageOutcome> {
  const hero = site.sections.find((s) => s.type === 'hero') as
    | Extract<WebsiteSchema['sections'][number], { type: 'hero' }>
    | undefined

  const trimmed = (request || '').trim()
  const brief = analyzeBrief(trimmed || site.meta.name, site)
  const slide = hero?.slides?.[slideIndex]
  const imagePrompt = trimmed
    ? buildRequestedImagePrompt(trimmed, site)
    : buildHeroImagePrompt(brief, slide?.title || site.meta.tagline)

  if (!hero || !slide) return { status: 'failed', imagePrompt }

  const altBase =
    site.meta.language === 'tr'
      ? `${site.meta.name} tanıtım görseli`
      : `${site.meta.name} hero image`

  const directUrl = /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null

  const targets: SiteImageRef[] = []
  const assign = (current: SiteImageRef | undefined): SiteImageRef => {
    const next: SiteImageRef = {
      ...(current ?? {}),
      imagePrompt: directUrl ? (current?.imagePrompt || imagePrompt) : imagePrompt,
      alt: current?.alt || altBase,
      aspectRatio: current?.aspectRatio ?? '16/9',
      src: directUrl ?? current?.src,
    }
    targets.push(next)
    return next
  }

  slide.image = assign(slide.image)
  // The slider shows slides[0] first, so the hero's own image mirrors it.
  if (slideIndex === 0) hero.image = assign(hero.image)

  if (directUrl) return { status: 'linked', imagePrompt }
  if (!imageGenerationAvailable()) return { status: 'skipped', imagePrompt }

  const res = await generateSiteImage({
    prompt: imagePrompt,
    aspectRatio: toProviderAspect(targets[0]?.aspectRatio),
  })
  if (!res) return { status: 'failed', imagePrompt }

  const src = await persistImageDataUri(res.src)
  for (const target of targets) target.src = src
  return { status: 'generated', imagePrompt }
}

/** Maps a schema aspect ratio ("4/3") to a provider aspect ("4:3"). */
function toProviderAspect(aspect?: SiteImageRef['aspectRatio']): ImageAspect {
  switch (aspect) {
    case '1/1':
      return '1:1'
    case '4/3':
      return '4:3'
    case '3/2':
      return '3:2'
    case '3/4':
      return '3:4'
    case '9/16':
      return '9:16'
    case '16/9':
    default:
      return '16:9'
  }
}

/** Ensures a hero/slide has a structured `image` object carrying the prompt. */
function ensureImageRef(
  current: SiteImageRef | undefined,
  legacyPrompt: string | undefined,
  dynamicPrompt: string,
  alt: string,
): SiteImageRef {
  return {
    ...(current ?? {}),
    imagePrompt: dynamicPrompt || current?.imagePrompt || legacyPrompt || dynamicPrompt,
    alt: current?.alt || alt,
    aspectRatio: current?.aspectRatio ?? '16/9',
  }
}

/**
 * Mutates the site's hero (and any slider slides) so each carries a dynamic,
 * brief-derived `imagePrompt`, then best-effort resolves a real `src` via the
 * image provider. If generation is unavailable it leaves the prompt in place
 * and the renderer falls back to the gradient placeholder — never broken.
 *
 * Returns metadata describing what happened, useful for logging/telemetry.
 */
export async function attachHeroImage(
  site: WebsiteSchema,
  prompt: string,
): Promise<{ brief: Brief; heroPrompt: string; generated: boolean; available: boolean }> {
  const brief = analyzeBrief(prompt, site)
  const available = imageGenerationAvailable()
  let generated = false

  const hero = site.sections.find((s) => s.type === 'hero') as
    | Extract<WebsiteSchema['sections'][number], { type: 'hero' }>
    | undefined

  const heroPrompt = buildHeroImagePrompt(brief, site?.meta?.tagline)
  if (!hero) return { brief, heroPrompt, generated, available }

  const altBase =
    site.meta.language === 'tr'
      ? `${site.meta.name} tanıtım görseli`
      : `${site.meta.name} hero image`

  // 1) Always attach the dynamic prompt (future-proof + placeholder-friendly).
  hero.image = ensureImageRef(hero.image, hero.imagePrompt, heroPrompt, altBase)

  // 2) Give every slider slide a slide-specific dynamic prompt up front, so the
  //    prompt-only fallback is always populated regardless of generation.
  const slides = Array.isArray(hero.slides) ? hero.slides : []
  for (const slide of slides) {
    const slidePrompt = buildHeroImagePrompt(brief, slide.title || site?.meta?.tagline)
    slide.image = ensureImageRef(slide.image, slide.imagePrompt, slidePrompt, altBase)
  }

  // 3) Best-effort real images. The FIRST visible image is generated on its
  //    own and awaited before the rest, so the primary hero/slide visual is
  //    guaranteed even if the slower secondary images time out (priority:
  //    "the first hero image must always be produced"). Remaining images then
  //    run in PARALLEL so latency does not compound. Any failure is a silent
  //    no-op that leaves the prompt-only fallback intact.
  if (available) {
    const MAX_IMAGES = 3

    // A slider shows slides[0] first; every other variant shows hero.image.
    const variantIsSlider =
      hero.variant === 'slider' || (!hero.variant && slides.length > 1)
    const firstVisible =
      (variantIsSlider ? slides[0]?.image : undefined) || hero.image || undefined

    // Ordered, de-duplicated targets with the first-visible image at the head.
    const ordered: SiteImageRef[] = []
    const pushUnique = (img?: SiteImageRef) => {
      if (img && !ordered.includes(img)) ordered.push(img)
    }
    pushUnique(firstVisible)
    pushUnique(hero.image)
    for (const s of slides) pushUnique(s.image)
    const targets = ordered.slice(0, MAX_IMAGES)

    // Generate, then persist the (large) base64 data URI to storage so the
    // schema only ever carries a short, durable URL. `persistImageDataUri` is
    // best-effort: on any failure it returns the data URI unchanged so the
    // image still renders.
    const gen = async (img: SiteImageRef) => {
      const res = await generateSiteImage({
        prompt: img.imagePrompt,
        aspectRatio: toProviderAspect(img.aspectRatio),
      })
      if (!res) return null
      img.src = await persistImageDataUri(res.src)
      return img
    }

    // 3a) Guarantee the first visible image.
    const [primary, ...rest] = targets
    if (primary) {
      const res = await gen(primary)
      if (res) generated = true
    }

    // 3b) Best-effort fill the remaining images in parallel.
    if (rest.length) {
      const results = await Promise.all(rest.map(gen))
      if (results.some(Boolean)) generated = true
    }
  }

  return { brief, heroPrompt, generated, available }
}

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { detectSector, type Sector } from '@/lib/sector-profiles'
import type { WebsiteSchema, SiteImageRef } from '@/lib/website-schema'
import {
  generateSiteImage,
  getImageFallbackModel,
  IMAGE_FALLBACK_TIMEOUT_MS,
  imageGenerationAvailable,
  type ImageAspect,
  type ImageFailureReason,
  type ImageResult,
  type ProviderFailureReason,
} from '@/lib/image-provider'
import { ImageStorageError, persistImageDataUri } from '@/lib/image-storage'
import { generateWithRelevanceGuard } from '@/lib/image-text-guard'
import { imagePromptRules, stripBrandNameFromImagePrompt, wantsIllustrationStyle } from '@/lib/image-prompt-rules'
import {
  describeVisualRequest,
  findGeneratedTopic,
  resolveVisualTopic,
  resolveVisualTopicSignals,
  stripImagePromptBoilerplate,
  variationCue,
  type VisualTopic,
  type VisualTopicSignals,
} from '@/lib/visual-subjects'

/**
 * Hero image intelligence
 * -----------------------
 * Turns the user's freeform site-creation brief into a DYNAMIC, brief-specific
 * image prompt for the hero/slider — instead of hardcoding a handful of static
 * sector images. It extracts the signals a good image needs (sector, business
 * type, style, audience, visual need) and composes a single descriptive prompt,
 * then (best-effort) resolves it to a real image via the server-side provider.
 * Unknown default-sector briefs use a validated text-model inference when
 * available, otherwise a neutral abstract scene; missing keywords never skip generation.
 */

export type Brief = {
  sector: Sector
  businessType: string
  confidence: 'high' | 'medium' | 'low'
  style: string
  audience: string
  visualNeed: string
  /** Look-alike subjects the image must NOT show (wrong-sector associations). */
  avoid?: string
  /** True only when the request explicitly asks for drawn artwork (never for logos). */
  illustrative?: boolean
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
  default: 'a quiet abstract editorial composition with translucent layered forms, tactile materials and soft directional light',
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
  const tone = site?.meta.tone
    ? stripBrandNameFromImagePrompt(site.meta.tone, site.meta.name)
    : ''
  if (tone) parts.push(tone)

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
 * do we fall back to the sector scene, and finally to a neutral abstract image.
 */
function buildVisualTopicSignals(prompt: string, site?: WebsiteSchema): VisualTopicSignals {
  const serviceTitles = (site?.sections ?? []).flatMap((section) => {
    if (section.type === 'services' || section.type === 'features') {
      return section.items.map((item) => item.title.trim()).filter(Boolean)
    }
    return []
  })
  const businessName = site?.meta.name?.trim() || site?.navigation?.logoText?.trim()
  return {
    ...(businessName ? { businessName } : {}),
    ...(site?.meta.tagline ? { tagline: site.meta.tagline } : {}),
    serviceTitles: Array.from(new Set(serviceTitles)).slice(0, 30),
    ...(site?.meta.audience ? { audience: site.meta.audience } : {}),
    ...(prompt.trim() ? { rest: prompt.trim() } : {}),
  }
}

const visualSubjectPredictionSchema = z.object({
  business: z.string().trim().min(2).max(100),
  subject: z.string().trim().min(20).max(600),
  avoid: z.string().trim().max(400).optional().nullable(),
}).strict()

const VISUAL_SUBJECT_MODEL = 'google/gemini-2.5-flash-lite'
const VISUAL_SUBJECT_TIMEOUT_MS = 6_000

type VisualSubjectInference = (signals: VisualTopicSignals) => Promise<VisualTopic | null>

function visualSubjectSignature(signals: VisualTopicSignals): string {
  return createHash('sha256')
    .update(JSON.stringify({
      businessName: signals.businessName ?? '',
      tagline: signals.tagline ?? '',
      serviceTitles: signals.serviceTitles ?? [],
      audience: signals.audience ?? '',
      rest: signals.rest ?? '',
    }))
    .digest('hex')
}

export function parseVisualSubjectPrediction(text: string, brandName?: string): VisualTopic | null {
  try {
    const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    const parsed = visualSubjectPredictionSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    const business = stripBrandNameFromImagePrompt(parsed.data.business, brandName)
    const subject = stripBrandNameFromImagePrompt(parsed.data.subject, brandName)
    const avoid = parsed.data.avoid
      ? stripBrandNameFromImagePrompt(parsed.data.avoid, brandName)
      : undefined
    if (!business || !subject) return null
    return { business, subject, ...(avoid ? { avoid } : {}) }
  } catch {
    return null
  }
}

async function inferVisualTopic(signals: VisualTopicSignals): Promise<VisualTopic | null> {
  try {
    const { generateText } = await import('ai')
    const { text } = await generateText({
      model: VISUAL_SUBJECT_MODEL,
      temperature: 0,
      maxOutputTokens: 260,
      abortSignal: AbortSignal.timeout(VISUAL_SUBJECT_TIMEOUT_MS),
      prompt: [
        'Infer the real business category from the site details and return exactly one JSON object with keys business, subject, and avoid.',
        'All three values must be in English. business is a short category label. subject is one concrete, photographable scene naming a plausible person, tool, or place. avoid is a short list of look-alike subjects that would misrepresent this business.',
        'Do not include a brand name, readable text, signage, watermark, logo, or invented claims in the scene. Do not guess facts absent from the supplied details. If the category is unclear, choose a restrained, plausible professional scene rather than an unrelated industry.',
        `Business name: ${signals.businessName || '(not supplied)'}`,
        `Tagline: ${signals.tagline || '(not supplied)'}`,
        `Audience: ${signals.audience || '(not supplied)'}`,
        `Service titles: ${(signals.serviceTitles || []).join('; ') || '(not supplied)'}`,
        `Brief details: ${signals.rest || '(not supplied)'}`,
      ].join('\n'),
    })
    return parseVisualSubjectPrediction(text, signals.businessName)
  } catch {
    return null
  }
}

export function analyzeBrief(prompt: string, site?: WebsiteSchema): Brief {
  const sector = detectSector(prompt)
  const signals = buildVisualTopicSignals(prompt, site)
  const resolution = resolveVisualTopicSignals(signals)
  const topic = resolution.topic
  const haystack = [
    prompt,
    signals.businessName,
    signals.tagline,
    signals.audience,
    ...(signals.serviceTitles || []),
  ]
    .filter(Boolean)
    .join(' ')

  const confidence: Brief['confidence'] =
    topic ? 'high' : sector === 'default' ? 'low' : 'medium'
  const visualNeed =
    topic?.subject ??
    (sector === 'default'
      ? 'a quiet abstract editorial composition of translucent layered forms, tactile materials and soft directional light, with no identifiable brand symbols'
      : SECTOR_SUBJECT[sector])
  const avoid =
    topic?.avoid ??
    (confidence === 'low'
      ? 'unrelated people, generic office or meeting scenes, bakery or food imagery, landscapes, and stock subjects from industries not named in the brief'
      : undefined)

  return {
    sector,
    businessType: topic?.business ?? SECTOR_BUSINESS[sector],
    confidence,
    style: styleDescriptor(prompt, site),
    audience: site?.meta.audience || 'a broad, quality-seeking audience',
    visualNeed,
    avoid,
    illustrative: wantsIllustrationStyle(haystack),
  }
}

export async function resolveVisualBrief(
  prompt: string,
  site?: WebsiteSchema,
  infer: VisualSubjectInference = inferVisualTopic,
): Promise<Brief> {
  const signals = buildVisualTopicSignals(prompt, site)
  const resolution = resolveVisualTopicSignals(signals)
  const baseBrief = analyzeBrief(prompt, site)
  if (resolution.topic) return baseBrief

  const signature = visualSubjectSignature(signals)
  const cache = site?.meta.visualSubjectCache
  let inferredTopic: VisualTopic | null = null

  if (cache?.version === 1 && cache.signature === signature) {
    inferredTopic = {
      business: cache.business,
      subject: cache.subject,
      ...(cache.avoid ? { avoid: cache.avoid } : {}),
    }
  } else {
    try {
      inferredTopic = await infer(signals)
    } catch {
      inferredTopic = null
    }
    if (inferredTopic && site) {
      site.meta.visualSubjectCache = {
        version: 1,
        signature,
        business: inferredTopic.business,
        subject: inferredTopic.subject,
        ...(inferredTopic.avoid ? { avoid: inferredTopic.avoid } : {}),
      }
    }
  }

  const topic = inferredTopic ?? resolution.bestTopic
  if (!topic) return baseBrief

  return {
    ...baseBrief,
    businessType: topic.business,
    confidence: 'high',
    visualNeed: topic.subject,
    avoid: topic.avoid,
  }
}

/** Medium line: photograph by default, drawn artwork only when explicitly requested. */
function heroKind(brief: Brief): string {
  return brief.illustrative
    ? `Polished hero banner illustration for a ${brief.businessType}.`
    : `Photorealistic hero banner photograph for a ${brief.businessType}.`
}

function heroRendering(brief: Brief): string {
  return brief.illustrative
    ? 'high resolution, crisp clean artwork, cohesive illustrated style,'
    : 'high resolution, sharp focus, realistic documentary photography,'
}

/**
 * Composes the final image prompt from the brief. The prompt is fully dynamic:
 * it reflects the actual user request, the site's tone and the audience, rather
 * than selecting from a fixed set of canned images.
 */
export function buildHeroImagePrompt(brief: Brief, extra?: string, brandName?: string): string {
  // SUBJECT FIRST: fast diffusion models weight the opening tokens most
  // heavily, so leading with the scene (instead of "Professional hero banner
  // photograph for a …") is what keeps the result on-topic.
  const safeContext = extra ? stripBrandNameFromImagePrompt(extra, brandName) : ''
  const bits = [
    `${brief.visualNeed}.`,
    heroKind(brief),
    brief.avoid ? `Do NOT depict: ${brief.avoid}.` : '',
    `Style: ${brief.style}.`,
    safeContext ? `Context: ${safeContext}.` : '',
    'Wide cinematic composition with clear negative space for overlaid text,',
    heroRendering(brief),
    'Not an empty landscape.',
    imagePromptRules(brief.illustrative),
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
export function buildRequestedImagePrompt(
  request: string,
  site?: WebsiteSchema,
  resolvedBrief?: Brief,
): string {
  // The editor shows the stored prompt verbatim, so an unedited "regenerate"
  // sends all the builder boilerplate back; strip it before re-interpreting.
  let clean = stripImagePromptBoilerplate(request)

  // A stale SYSTEM-written scene (verbatim dictionary sentence) that contradicts
  // what the site is — e.g. the old greengrocer scene on a butcher site — is
  // replaced by the site's own scene. Text the user wrote by hand never contains
  // a whole dictionary sentence, so genuine edits are left alone.
  const siteTopic = site
    ? resolveVisualTopicSignals(buildVisualTopicSignals('', site)).topic ??
      (resolvedBrief
        ? {
            business: resolvedBrief.businessType,
            subject: resolvedBrief.visualNeed,
            avoid: resolvedBrief.avoid,
          }
        : null)
    : null
  const stale = findGeneratedTopic(clean)
  if (stale && siteTopic && stale.subject !== siteTopic.subject) {
    clean = clean.replace(stale.subject, siteTopic.subject)
  }

  const subject = describeVisualRequest(clean)
  const brief = resolvedBrief ?? analyzeBrief(
    `${clean} ${site?.meta.name ?? ''} ${site?.meta.tagline ?? ''}`,
    site,
  )
  // The description itself decides the topic; the site identity is the fallback.
  const topic = resolveVisualTopic(clean) ?? siteTopic
  if (topic) {
    brief.businessType = topic.business
    brief.avoid = topic.avoid
  }
  return [
    `${subject}.`,
    heroKind(brief),
    brief.avoid ? `Do NOT depict: ${brief.avoid}.` : '',
    `Style: ${brief.style}.`,
    'Wide cinematic composition with clear negative space for overlaid text,',
    heroRendering(brief),
    'Not an empty landscape.',
    imagePromptRules(brief.illustrative),
  ]
    .filter(Boolean)
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
  status: 'generated' | 'linked' | 'failed' | 'skipped'
  imagePrompt: string
  reason?: ImageFailureReason
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
  const directUrl = /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null
  const brief = directUrl
    ? analyzeBrief(trimmed || site.meta.name, site)
    : await resolveVisualBrief(trimmed || site.meta.name, site)
  const imagePrompt = trimmed
    ? buildRequestedImagePrompt(trimmed, site, brief)
    : buildHeroImagePrompt(brief, site.meta.tagline, site.meta.name)

  if (!hero) return { status: 'failed', imagePrompt, reason: 'provider_error' }

  const altBase =
    site.meta.language === 'tr'
      ? `${site.meta.name} tanıtım görseli`
      : `${site.meta.name} hero image`

  // The slider shows slides[0] first; every other variant shows hero.image.
  const slides = Array.isArray(hero.slides) ? hero.slides : []
  const variantIsSlider = hero.variant === 'slider' || (!hero.variant && slides.length > 1)

  // A direct URL is honoured verbatim — this is the manual escape hatch.
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
  if (!imageGenerationAvailable()) return { status: 'skipped', imagePrompt, reason: 'disabled' }

  let failureReason: ProviderFailureReason | undefined
  const res = await generateRelevantSiteImage(
    `${imagePrompt} ${variationCue()}`,
    toProviderAspect(targets[0]?.aspectRatio),
    brief.businessType,
    (reason) => {
      failureReason = reason
    },
  )
  if (!res) {
    return {
      status: failureReason === 'disabled' ? 'skipped' : 'failed',
      imagePrompt,
      reason: failureReason ?? 'provider_error',
    }
  }

  let src: string
  try {
    src = await persistImageDataUri(res.src)
  } catch (error) {
    if (!(error instanceof ImageStorageError)) throw error
    return { status: 'failed', imagePrompt, reason: 'storage_failed' }
  }
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
  const directUrl = /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null
  const brief = directUrl
    ? analyzeBrief(trimmed || site.meta.name, site)
    : await resolveVisualBrief(trimmed || site.meta.name, site)
  const slide = hero?.slides?.[slideIndex]
  const imagePrompt = trimmed
    ? buildRequestedImagePrompt(trimmed, site, brief)
    : buildHeroImagePrompt(brief, slide?.title || site.meta.tagline, site.meta.name)

  if (!hero || !slide) return { status: 'failed', imagePrompt, reason: 'provider_error' }

  const altBase =
    site.meta.language === 'tr'
      ? `${site.meta.name} tanıtım görseli`
      : `${site.meta.name} hero image`

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
  if (!imageGenerationAvailable()) return { status: 'skipped', imagePrompt, reason: 'disabled' }

  let failureReason: ProviderFailureReason | undefined
  const res = await generateRelevantSiteImage(
    `${imagePrompt} ${variationCue()}`,
    toProviderAspect(targets[0]?.aspectRatio),
    brief.businessType,
    (reason) => {
      failureReason = reason
    },
  )
  if (!res) {
    return {
      status: failureReason === 'disabled' ? 'skipped' : 'failed',
      imagePrompt,
      reason: failureReason ?? 'provider_error',
    }
  }

  let src: string
  try {
    src = await persistImageDataUri(res.src)
  } catch (error) {
    if (!(error instanceof ImageStorageError)) throw error
    return { status: 'failed', imagePrompt, reason: 'storage_failed' }
  }
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

async function generateRelevantSiteImage(
  prompt: string,
  aspectRatio: ImageAspect,
  business: string,
  onFailure?: (reason: ProviderFailureReason) => void,
): Promise<ImageResult> {
  let lastFailure: ProviderFailureReason | undefined
  const image = await generateWithRelevanceGuard(
    async (attempt) => {
      let attemptFailure: ProviderFailureReason | undefined
      const retry = attempt === 'retry'
      const result = await generateSiteImage(
        {
          prompt: retry ? `${prompt} ${variationCue()}` : prompt,
          aspectRatio,
          ...(retry ? { model: getImageFallbackModel(), allowFallback: false } : {}),
          onFailure: (reason) => {
            attemptFailure = reason
          },
        },
        retry ? { timeoutMs: IMAGE_FALLBACK_TIMEOUT_MS } : undefined,
      )
      if (!result && attemptFailure) lastFailure = attemptFailure
      return result
    },
    business,
  )

  if (!image) onFailure?.(lastFailure ?? 'provider_error')
  return image
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
): Promise<{
  brief: Brief
  heroPrompt: string
  generated: boolean
  available: boolean
  /** Images that were generated but could not be stored (never written to the schema). */
  storageFailed: number
  reason?: ImageFailureReason
}> {
  const brief = await resolveVisualBrief(prompt, site)
  const available = imageGenerationAvailable()
  let generated = false
  let storageFailed = 0
  let failureReason: ProviderFailureReason | undefined

  const hero = site.sections.find((s) => s.type === 'hero') as
    | Extract<WebsiteSchema['sections'][number], { type: 'hero' }>
    | undefined

  const heroPrompt = buildHeroImagePrompt(brief, site?.meta?.tagline, site?.meta?.name)
  if (!hero) {
    return {
      brief,
      heroPrompt,
      generated,
      available,
      storageFailed,
      reason: available ? 'provider_error' : 'disabled',
    }
  }

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
    const slidePrompt = buildHeroImagePrompt(brief, slide.title || site?.meta?.tagline, site?.meta?.name)
    slide.image = ensureImageRef(slide.image, slide.imagePrompt, slidePrompt, altBase)
  }

  // 3) Best-effort real images. The first visible image is always awaited and
  //    retained as the primary outcome; remaining attempts run concurrently so
  //    their latency does not compound. Any failed target keeps its prompt-only
  //    fallback intact.
  // Unresolved businesses still get a neutral, prompt-safe image attempt; the
  // resolver must never suppress generation solely because the dictionary missed.
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
      if (img && !img.src && !ordered.includes(img)) ordered.push(img)
    }
    pushUnique(firstVisible)
    pushUnique(hero.image)
    for (const s of slides) pushUnique(s.image)
    const targets = ordered.slice(0, MAX_IMAGES)

    // Generate, then persist the (large) base64 data URI to storage so the
    // schema only ever carries a short, durable URL. `persistImageDataUri`
    // throws when storage fails: that image keeps NO new src (never base64),
    // counts as not generated, and is reported via `storageFailed`.
    const gen = async (img: SiteImageRef) => {
      const res = await generateRelevantSiteImage(
        img.imagePrompt,
        toProviderAspect(img.aspectRatio),
        brief.businessType,
        (reason) => {
          failureReason = reason
        },
      )
      if (!res) return null
      try {
        img.src = await persistImageDataUri(res.src)
      } catch (err) {
        if (!(err instanceof ImageStorageError)) throw err
        storageFailed += 1
        failureReason = 'provider_error'
        return null
      }
      return img
    }

    // Generate the primary hero and secondary images concurrently. The primary
    // promise is still awaited before returning; secondary failures stay best-effort.
    const [primary, ...rest] = targets
    const [primaryResult, secondaryResults] = await Promise.all([
      primary ? gen(primary) : Promise.resolve(null),
      Promise.all(rest.map(gen)),
    ])
    if (primaryResult || secondaryResults.some(Boolean)) generated = true
  }

  const reason: ImageFailureReason | undefined =
    storageFailed > 0
      ? 'storage_failed'
      : generated
        ? undefined
        : available
          ? failureReason ?? 'provider_error'
          : 'disabled'
  if (reason) console.info('[hero-image-outcome]', { reason, available, generated, storageFailed })
  return {
    brief,
    heroPrompt,
    generated,
    available,
    storageFailed,
    ...(reason ? { reason } : {}),
  }
}

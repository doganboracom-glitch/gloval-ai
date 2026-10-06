import type { WebsiteSchema, Section } from '@/lib/website-schema'
import { generateSiteImage, imageGenerationAvailable, type ImageAspect } from '@/lib/image-provider'
import { persistImageDataUri } from '@/lib/image-storage'
import { analyzeBrief } from '@/lib/hero-image'
import { describeVisualRequest } from '@/lib/visual-subjects'
import { collectionOf, IMAGE_ITEM_SECTIONS } from '@/lib/website-edit-operations'

/**
 * Section image intelligence
 * --------------------------
 * The hero is not the only visual on a generated site: gallery tiles, portfolio
 * cards and team portraits all carry their own `imagePrompt`/`src`. This module
 * resolves ALL of them — automatically after generation, and one-by-one when
 * the user regenerates a single image from the editor — using the same brief
 * analysis and provider seam as the hero, so every image matches the sector,
 * tone and language of the site.
 */

/** How many images we are willing to generate in one request (latency guard). */
const MAX_AUTO_IMAGES = 6

export type ImageTarget = {
  /** Index of the section inside `site.sections`. */
  index: number
  /** Index of the item inside the section's collection. */
  itemIndex: number
  item: Record<string, unknown>
  section: Section
}

/** Every collection item on the site that is supposed to carry an image. */
export function imageTargets(site: WebsiteSchema): ImageTarget[] {
  const out: ImageTarget[] = []
  site.sections.forEach((section, index) => {
    if (!IMAGE_ITEM_SECTIONS.includes(section.type)) return
    const list = collectionOf(section)
    if (!list) return
    list.forEach((item, itemIndex) => out.push({ index, itemIndex, item, section }))
  })
  return out
}

/** Team portraits are vertical; slider slides are wide; tiles read best at 4:3. */
function aspectFor(section: Section): ImageAspect {
  if (section.type === 'team') return '3:4'
  if (section.type === 'slider') return '16:9'
  return '4:3'
}

/**
 * Composes the final prompt for one collection item. The item's own
 * `imagePrompt` (or its title/caption/name) is the subject; the site brief adds
 * business type, tone and lighting so the whole site looks like one shoot.
 * Turkish wording is mapped to English visual vocabulary first, because image
 * models are English-centric.
 */
export function buildItemImagePrompt(
  site: WebsiteSchema,
  target: ImageTarget,
  override?: string,
): string {
  const item = target.item
  const raw =
    (override && override.trim()) ||
    [item.imagePrompt, item.title, item.caption, item.name, item.category]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 1)
      .join(', ')
  const brief = analyzeBrief(`${raw} ${site.meta.name} ${site.meta.tagline}`, site)
  const subject = raw ? describeVisualRequest(raw) : brief.visualNeed

  if (target.section.type === 'team') {
    const role = typeof item.role === 'string' ? item.role : ''
    return [
      `Professional corporate headshot portrait of a ${role || 'team member'} at a ${brief.businessType}.`,
      subject ? `Context: ${subject}.` : '',
      `Style: ${brief.style}.`,
      'Friendly natural expression, shallow depth of field, clean neutral background,',
      'sharp focus, realistic photography, no text, no watermark, no collage.',
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return [
    `${subject}.`,
    `Photorealistic photograph for the ${target.section.type} section of a ${brief.businessType}.`,
    `Style: ${brief.style}.`,
    'Well-composed single subject, high resolution, sharp focus, realistic documentary photography,',
    'no text, no watermark, no logos, no collage.',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Generates one image and stores a short, durable URL on the item. */
async function resolveTarget(
  site: WebsiteSchema,
  target: ImageTarget,
  override?: string,
): Promise<boolean> {
  const prompt = buildItemImagePrompt(site, target, override)
  target.item.imagePrompt = prompt
  const res = await generateSiteImage({ prompt, aspectRatio: aspectFor(target.section) })
  if (!res) return false
  target.item.src = await persistImageDataUri(res.src)
  return true
}

/**
 * Fills in every MISSING gallery / portfolio / team image, in parallel and
 * best-effort. Already-resolved images are never regenerated, so this is safe
 * to call again after an edit. Any failure is a silent no-op that leaves the
 * prompt-only gradient fallback in place — the site is never broken.
 */
export async function attachSectionImages(
  site: WebsiteSchema,
  prompt?: string,
): Promise<{ available: boolean; generated: number; requested: number }> {
  const available = imageGenerationAvailable()
  const pending = imageTargets(site)
    .filter((t) => typeof t.item.src !== 'string' || !t.item.src)
    .slice(0, MAX_AUTO_IMAGES)

  if (!available || pending.length === 0) {
    return { available, generated: 0, requested: pending.length }
  }

  // The brief is derived per item, but seeding it with the original prompt keeps
  // the whole set on-topic when the item copy alone is thin ("Proje 1").
  const results = await Promise.all(
    pending.map((target) =>
      resolveTarget(site, target, prompt && pending.length === 1 ? prompt : undefined).catch(
        () => false,
      ),
    ),
  )

  return {
    available,
    generated: results.filter(Boolean).length,
    requested: pending.length,
  }
}

export type ItemImageOutcome = {
  status: 'generated' | 'linked' | 'failed' | 'skipped'
  imagePrompt: string
}

/**
 * Replaces ONE collection item's image from an explicit request. A direct URL
 * is linked verbatim (the fully manual escape hatch); anything else is treated
 * as a visual description and generated. Only image fields are touched.
 */
export async function applyItemImageRequest(
  site: WebsiteSchema,
  index: number,
  itemIndex: number,
  request: string,
): Promise<ItemImageOutcome> {
  const section = site.sections[index]
  const item = collectionOf(section)?.[itemIndex]
  if (!section || !item) return { status: 'failed', imagePrompt: '' }

  const target: ImageTarget = { index, itemIndex, item, section }
  const trimmed = (request || '').trim()

  const directUrl = /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null
  if (directUrl) {
    item.src = directUrl
    return { status: 'linked', imagePrompt: String(item.imagePrompt ?? '') }
  }

  const imagePrompt = buildItemImagePrompt(site, target, trimmed || undefined)
  item.imagePrompt = imagePrompt
  if (!imageGenerationAvailable()) return { status: 'skipped', imagePrompt }

  // Clear the stale image so a genuine failure cannot masquerade as success.
  const previousSrc = item.src
  item.src = undefined
  const ok = await resolveTarget(site, target, trimmed || undefined)
  if (!ok) item.src = previousSrc
  return { status: ok ? 'generated' : 'failed', imagePrompt: String(item.imagePrompt ?? imagePrompt) }
}

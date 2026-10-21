import type { WebsiteSchema } from '@/lib/website-schema'
import { generateSiteImage, imageGenerationAvailable } from '@/lib/image-provider'
import { ImageStorageError, persistImageDataUri } from '@/lib/image-storage'
import {
  aboutLacksImage,
  buildAboutImagePrompt,
  pickAboutLayout,
  suggestAboutAlt,
} from '@/lib/about-media'
import { detectSector } from '@/lib/sector-profiles'

/**
 * Server-side about image generation. Uses the same provider seam (and the
 * same no-text guard) as every other site image; the prompt additionally bans
 * people, so no unreviewed face or figure can land in the about section.
 * Returns null when nothing was produced, so callers charge only accepted output.
 */
async function renderAboutImage(site: WebsiteSchema, prompt: string, request: string) {
  if (!imageGenerationAvailable()) return null
  const imagePrompt = buildAboutImagePrompt(site, prompt, request)
  const result = await generateSiteImage({ prompt: imagePrompt, aspectRatio: '4:3' }).catch(() => null)
  if (!result) return null
  const src = await persistImageDataUri(result.src)
  return src ? { src, imagePrompt } : null
}

/**
 * New-site default: when the about section still has no image after the free
 * reuse step (no hero, gallery, portfolio or slider image on the site), try to
 * generate one. On failure the section stays text-only. Never throws.
 */
export async function attachAboutImage(site: WebsiteSchema, prompt = ''): Promise<WebsiteSchema> {
  if (!aboutLacksImage(site)) return site
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const image = await renderAboutImage(site, prompt, '').catch(() => null)
  if (!image) return site

  const sector = detectSector([prompt, site.meta.name, site.meta.tagline].filter(Boolean).join(' '))
  const sections = site.sections.map((section) => {
    if (section.type !== 'about') return section
    if (section.media?.enabled === false) return section
    if ((section.media?.images ?? []).some((i) => i.src)) return section
    const alt = suggestAboutAlt(site, section.title, lang, prompt)
    return {
      ...section,
      media: {
        ...section.media,
        enabled: true,
        layout: pickAboutLayout(sector, 1, section.media?.figure),
        images: [{ src: image.src, alt, imagePrompt: image.imagePrompt, origin: 'ai' }],
      },
    }
  })
  return { ...site, sections }
}

/**
 * Preview flow: runs the SAME provider seam, no-text guard and no-people
 * prompt as every other about image, but returns the raw image (data URI or
 * URL) instead of touching the site. Null when nothing acceptable was produced.
 */
export async function generateAboutPreviewImage(
  site: WebsiteSchema,
  index: number,
  request = '',
): Promise<{ image: string; alt: string; imagePrompt: string } | null> {
  const section = site.sections[index]
  if (!section || section.type !== 'about') return null
  if (!imageGenerationAvailable()) return null
  const imagePrompt = buildAboutImagePrompt(site, '', request)
  const result = await generateSiteImage({ prompt: imagePrompt, aspectRatio: '4:3' }).catch(() => null)
  if (!result) return null
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  return { image: result.src, alt: suggestAboutAlt(site, section.title, lang), imagePrompt }
}

/** Editor "AI ile üret": fills one about section. Same output contract as attachAboutImage. */
export async function generateAboutImageAt(
  site: WebsiteSchema,
  index: number,
  request = '',
): Promise<'generated' | 'failed' | 'skipped'> {
  const section = site.sections[index]
  if (!section || section.type !== 'about') return 'failed'
  if (!imageGenerationAvailable()) return 'skipped'
  // A storage failure is rethrown so the route can tell the user (and not charge).
  const image = await renderAboutImage(site, '', request).catch((err) => {
    if (err instanceof ImageStorageError) throw err
    return null
  })
  if (!image) return 'failed'

  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const existing = section.media?.images ?? []
  if (existing.length >= 3) return 'failed'
  site.sections[index] = {
    ...section,
    media: {
      ...section.media,
      enabled: true,
      layout: section.media?.layout ?? 'corner',
      images: [
        ...existing,
        { src: image.src, alt: suggestAboutAlt(site, section.title, lang), imagePrompt: image.imagePrompt, origin: 'ai' },
      ],
    },
  }
  return 'generated'
}

import type { WebsiteSchema } from '@/lib/website-schema'
import { generateSiteImage, imageGenerationAvailable } from '@/lib/image-provider'
import { buildServiceImagePrompt, serviceItemAt, suggestServiceAlt } from '@/lib/service-image'

/**
 * Preview flow for one service picture: same provider seam, no-text guard and
 * no-people prompt as every other generated image, but the raw image is only
 * returned, never written to the site. Null when nothing acceptable came out.
 */
export async function generateServicePreviewImage(
  site: WebsiteSchema,
  sectionIndex: number,
  itemIndex: number,
  request = '',
): Promise<{ image: string; alt: string; imagePrompt: string } | null> {
  const target = serviceItemAt(site, sectionIndex, itemIndex)
  if (!target || !imageGenerationAvailable()) return null
  const imagePrompt = buildServiceImagePrompt(site, target.item, request)
  const result = await generateSiteImage({ prompt: imagePrompt, aspectRatio: '4:3' }).catch(() => null)
  if (!result) return null
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  return { image: result.src, alt: suggestServiceAlt(site, target.item.title, lang), imagePrompt }
}

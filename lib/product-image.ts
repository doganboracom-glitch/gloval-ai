import type { WebsiteSchema } from '@/lib/website-schema'
import { generateSiteImage, imageGenerationAvailable } from '@/lib/image-provider'
import { findInlineCatalogSection } from '@/lib/product-items'

/** The inline catalog item a preview key like `products:2.1` points at, or null. */
export function productItemAt(site: WebsiteSchema, sectionIndex: number, itemIndex: number) {
  const section = site.sections[sectionIndex]
  if (!section || section.type !== 'products' || section !== findInlineCatalogSection(site)) return null
  const item = section.items[itemIndex]
  return item ? { section, item } : null
}

/** The inline catalog section a preview key like `productsbanner:2` points at, or null. */
export function catalogSectionAt(site: WebsiteSchema, sectionIndex: number) {
  const section = site.sections[sectionIndex]
  return section && section.type === 'products' && section === findInlineCatalogSection(site) ? section : null
}

/**
 * Preview flow for the catalog pages' header banner (wide image behind the
 * title on /urunlerimiz pages). Same provider seam and no-text guard; the image
 * is only returned, never written to the site.
 */
export async function generateProductsBannerPreviewImage(
  site: WebsiteSchema,
  sectionIndex: number,
  request = '',
): Promise<{ image: string; alt: string; imagePrompt: string } | null> {
  const section = catalogSectionAt(site, sectionIndex)
  if (!section || !imageGenerationAvailable()) return null
  const name = site.meta.name.trim()
  const subject = request.trim() || `a tidy, well-lit showroom or display of the products sold by ${name || 'a business'}`
  const imagePrompt = [
    `Photorealistic wide banner photograph: ${subject}.`,
    'Soft even lighting, calm composition with empty space for a headline, shallow depth of field.',
    'No people, no faces, no hands, no human figures, no text, no logos.',
    'High resolution, sharp focus.',
  ].join(' ')
  const result = await generateSiteImage({ prompt: imagePrompt, aspectRatio: '16:9' }).catch(() => null)
  if (!result) return null
  return { image: result.src, alt: name ? `${section.title || 'Ürünler'} - ${name}` : section.title || 'Ürünler', imagePrompt }
}

export function buildProductImagePrompt(item: { name: string; description?: string; category?: string }, request = ''): string {
  const subject = request.trim() || `the product "${item.name}"${item.category ? ` (${item.category})` : ''}`
  return [
    `Photorealistic studio product photograph of ${subject}.`,
    item.description?.trim() ? `Context: ${item.description.trim().slice(0, 240)}.` : '',
    'Single product centered on a clean neutral background, soft even lighting.',
    'No people, no faces, no hands, no human figures, no text, no logos, no packaging labels.',
    'High resolution, sharp focus.',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Preview flow for one product picture: same provider seam and no-text guard as
 * every other generated image; the raw image is only returned, never written to
 * the site. Null when nothing acceptable came out.
 */
export async function generateProductPreviewImage(
  site: WebsiteSchema,
  sectionIndex: number,
  itemIndex: number,
  request = '',
): Promise<{ image: string; alt: string; imagePrompt: string } | null> {
  const target = productItemAt(site, sectionIndex, itemIndex)
  if (!target || !imageGenerationAvailable()) return null
  const imagePrompt = buildProductImagePrompt(target.item, request)
  const result = await generateSiteImage({ prompt: imagePrompt, aspectRatio: '1:1' }).catch(() => null)
  if (!result) return null
  const name = site.meta.name.trim()
  return { image: result.src, alt: name ? `${target.item.name} - ${name}` : target.item.name, imagePrompt }
}

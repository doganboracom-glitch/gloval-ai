import type { WebsiteSchema } from '@/lib/website-schema'
import { detectSector } from '@/lib/sector-profiles'
import { sectorNoun } from '@/lib/about-media'
import { findServicesSection } from '@/lib/service-pages'

type Lang = 'tr' | 'en'

/** Business name + service, e.g. "Implant Tedavisi - Denta Estetik". Never empty. */
export function suggestServiceAlt(site: Pick<WebsiteSchema, 'meta'>, title: string, lang: Lang): string {
  const name = site.meta.name.trim()
  const service = title.trim()
  if (service && name) return `${service} - ${name}`
  if (service) return service
  if (name) return lang === 'tr' ? `${name} hizmet görseli` : `${name} service image`
  return lang === 'tr' ? 'Hizmet görseli' : 'Service image'
}

/**
 * Prompt for one service picture: the service's own scene or tools, never
 * people (nobody reviewed that face), and the shared no-text rule still applies.
 */
export function buildServiceImagePrompt(
  site: Pick<WebsiteSchema, 'meta'>,
  item: { title: string; description: string },
  request = '',
): string {
  const context = [site.meta.name, site.meta.tagline, site.meta.audience, item.title].filter(Boolean).join(' ')
  const noun = sectorNoun(detectSector(context), 'en')
  const subject = request.trim() || `the service "${item.title}" offered by a ${noun}`
  return [
    `Photorealistic photograph illustrating ${subject}.`,
    item.description.trim() ? `Context: ${item.description.trim().slice(0, 240)}.` : '',
    'Show the place, tools, materials or equipment involved, in a calm, well-lit scene.',
    'No people, no faces, no hands, no human figures, no mannequins, no text, no logos.',
    'Natural light, shallow depth of field, high resolution, sharp focus.',
  ]
    .filter(Boolean)
    .join(' ')
}

/** The section's `items` index a preview key like `services:2.1` points at, or null. */
export function serviceItemAt(site: WebsiteSchema, sectionIndex: number, itemIndex: number) {
  const section = site.sections[sectionIndex]
  if (!section || section.type !== 'services' || section !== findServicesSection(site)) return null
  const item = section.items[itemIndex]
  return item ? { section, item } : null
}

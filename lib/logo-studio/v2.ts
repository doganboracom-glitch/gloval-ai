import { wordIncludes } from '@/lib/visual-subjects'
import { getSectorInfoById, SECTOR_IDS } from '@/lib/logo-studio/emblem-local'
import { METAL_TONE_IDS, type LogoMetalTone, type LogoStyleId } from '@/lib/logo-studio/rules'

export type LogoStudioLocale = 'tr' | 'en'

export const LOGO_STUDIO_SECTORS = [
  { id: 'food', localId: 'food', tr: 'Restoran ve yeme-içme', en: 'Food and hospitality', objects: ['an espresso portafilter', 'a covered serving dome', 'a hand-rolled pasta wheel', 'a citrus peel curl'] },
  { id: 'health', localId: 'health', tr: 'Sağlık ve bakım', en: 'Health and care', objects: ['a dental mirror', 'a capsule split by a clean seam', 'a precision medical dropper', 'a pulse line nested in an anatomical form'] },
  { id: 'beauty', localId: 'beauty', tr: 'Mücevher ve güzellik', en: 'Jewelry and beauty', objects: ['a four-prong gemstone setting', 'a hinged jewelry clasp', 'a faceted stone viewed from the side', 'a perfume atomizer'] },
  { id: 'tech', localId: 'tech', tr: 'Teknoloji', en: 'Technology', objects: ['a fiber-optic ferrule', 'a circuit trace ending in a sensor aperture', 'a precision data relay', 'a microchip pin woven into a loop'] },
  { id: 'construction', localId: 'construction', tr: 'İnşaat ve mimarlık', en: 'Construction and architecture', objects: ['a keystone seated in a load-bearing arch', 'a cantilever joint', 'a blueprint corner with measured lines', 'a roof truss locking into place'] },
  { id: 'education', localId: 'education', tr: 'Eğitim', en: 'Education', objects: ['a folded page crease', 'a compass divider', 'a compact abacus with three beads', 'a bookmark ribbon passing through a book'] },
  { id: 'sport', localId: 'sport', tr: 'Spor ve fitness', en: 'Sports and fitness', objects: ['a climbing carabiner', 'a ball seam crossing a panel', 'a kettlebell handle in profile', 'a lane marker seen from above'] },
  { id: 'legal', localId: 'legal', tr: 'Hukuk ve finans', en: 'Legal and finance', objects: ['a balanced beam scale', 'a courthouse keystone', 'a document seal with a cut edge', 'a measured ledger corner'] },
  { id: 'retail', localId: 'retail', tr: 'Perakende ve e-ticaret', en: 'Retail and ecommerce', objects: ['a parcel secured with a ribbon knot', 'a folded tote-bag seam', 'a curled receipt beside a package', 'a display plinth with one product'] },
  { id: 'transport', localId: 'transport', tr: 'Ulaşım ve lojistik', en: 'Transport and logistics', objects: ['a wheel hub cross-section', 'a transfer point on a transit line', 'a cargo strap buckle', 'a compact rotor blade'] },
  { id: 'energy', localId: 'energy', tr: 'Enerji ve teknik hizmetler', en: 'Energy and technical services', objects: ['a turbine blade meeting its hub', 'a solar cell junction', 'a plug contact in profile', 'a power-flow path through a relay'] },
  { id: 'events', localId: 'events', tr: 'Etkinlik ve müzik', en: 'Events and music', objects: ['a vinyl record groove and tonearm', 'a DJ cue point on a turntable', 'a stage spotlight aperture', 'a sound wave passing through a gate'] },
  { id: 'travel', localId: 'travel', tr: 'Seyahat ve turizm', en: 'Travel and tourism', objects: ['a compass rose with one offset point', 'a lighthouse lens', 'a luggage clasp', 'a route marker at a crossing'] },
  { id: 'nature', localId: 'nature', tr: 'Doğa ve tarım', en: 'Nature and agriculture', objects: ['a seedpod cross-section', 'a terraced field contour', 'a beehive cell with a single opening', 'a root knot holding two forms together'] },
  { id: 'creative', localId: 'creative', tr: 'Yaratıcı hizmetler', en: 'Creative services', objects: ['a camera aperture with four blades', 'a film splice mark', 'a paper-cut registration edge', 'a lens focus ring'] },
  { id: 'generic', localId: 'generic', tr: 'Genel işletme', en: 'General business', objects: ['an interlocking crafted knot', 'a balanced architectural grid', 'a folded ribbon joint', 'a three-part fitted mechanism'] },
  { id: 'other', localId: 'generic', tr: 'Diğer', en: 'Other', objects: ['an interlocking crafted knot', 'a balanced architectural grid', 'a folded ribbon joint', 'a three-part fitted mechanism'] },
] as const

export type LogoStudioSectorId = (typeof LOGO_STUDIO_SECTORS)[number]['id']

export const MAX_LOGO_STUDIO_NOTES = 120
export const MAX_LOGO_STUDIO_DIRECTION = 80

export type ResolvedLogoStudioSector = {
  id: LogoStudioSectorId
  localId: string
  label: string
  subject: string
  objects: readonly string[]
}

export function logoStudioLocale(value: unknown): LogoStudioLocale {
  return typeof value === 'string' && value.toLowerCase().startsWith('tr') ? 'tr' : 'en'
}

export function resolveLogoStudioSector(id: unknown, locale: LogoStudioLocale): ResolvedLogoStudioSector | null {
  const sector = LOGO_STUDIO_SECTORS.find((candidate) => candidate.id === id)
  if (!sector) return null
  const local = getSectorInfoById(sector.localId)
  if (!local) return null
  return {
    id: sector.id,
    localId: sector.localId,
    label: sector[locale],
    subject: local.subject,
    objects: sector.objects,
  }
}

export type LogoStudioV2Request = {
  sectorId: LogoStudioSectorId
  localSectorId: string
  sectorLabel: string
  sectorPrompt: string
  industryNotes: string
  creativeDirection: string
}

export type LogoStudioV2InputResult =
  | { ok: true; value: LogoStudioV2Request }
  | { ok: false; error: 'invalid_sector' | 'invalid_notes' | 'invalid_direction' | 'brand_name_in_direction' }

function cleanPromptField(value: unknown, limit: number): string | null {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') return null
  const cleaned = value.normalize('NFC').replace(/\s+/gu, ' ').trim()
  if (Array.from(cleaned).length > limit) return null
  if (!/^[\p{L}\p{M}\p{N}\s.,;:!?()'’"“”&/+\-–—]*$/u.test(cleaned)) return null
  return cleaned
}

export function resolveLogoStudioV2Input({
  sectorId,
  industryNotes,
  creativeDirection,
  brand,
  locale,
}: {
  sectorId: unknown
  industryNotes: unknown
  creativeDirection: unknown
  brand: string
  locale: LogoStudioLocale
}): LogoStudioV2InputResult {
  const selectedId = sectorId === undefined || sectorId === null || sectorId === '' ? 'other' : sectorId
  const sector = resolveLogoStudioSector(selectedId, locale)
  if (!sector) return { ok: false, error: 'invalid_sector' }

  const notes = cleanPromptField(industryNotes, MAX_LOGO_STUDIO_NOTES)
  if (notes === null) return { ok: false, error: 'invalid_notes' }

  const direction = cleanPromptField(creativeDirection, MAX_LOGO_STUDIO_DIRECTION)
  if (direction === null) return { ok: false, error: 'invalid_direction' }
  if (direction && brand.trim() && wordIncludes(direction, brand.trim())) {
    return { ok: false, error: 'brand_name_in_direction' }
  }

  return {
    ok: true,
    value: {
      sectorId: sector.id,
      localSectorId: sector.localId,
      sectorLabel: sector.label,
      sectorPrompt: `${sector.subject}; distinctive object options: ${sector.objects.join(', ')}`,
      industryNotes: notes,
      creativeDirection: direction,
    },
  }
}

export function logoStudioMotifFor(sectorId: LogoStudioSectorId, index: number, seed: number, count: number): string {
  const sector = LOGO_STUDIO_SECTORS.find((candidate) => candidate.id === sectorId) ?? LOGO_STUDIO_SECTORS.at(-1)!
  const offset = Math.abs(Math.trunc(seed * count + index))
  return sector.objects[offset % sector.objects.length]
}

export function recommendedLogoStyle(sector: LogoStudioSectorId, tone: LogoMetalTone): LogoStyleId {
  if (tone === 'silver') return 'minimal'
  if (sector === 'beauty' || sector === 'travel') return tone === 'gold' ? 'luxury' : 'classic'
  if (sector === 'legal' || sector === 'construction' || sector === 'education') return 'classic'
  if (sector === 'food' || sector === 'tech' || sector === 'events' || sector === 'creative') return 'modern'
  if (tone === 'bronze') return 'classic'
  return 'modern'
}

export function sectorLabelStyle(tone: LogoMetalTone): LogoStyleId {
  return tone === 'silver' ? 'modern' : 'minimal'
}

export function isLogoStudioV2Enabled(value: string | undefined): boolean {
  return value === '1'
}

export function hasAllLegacyLogoSectors(): boolean {
  const listed = LOGO_STUDIO_SECTORS.filter((sector) => sector.id !== 'other').map((sector) => sector.id)
  return listed.length === SECTOR_IDS.length && SECTOR_IDS.every((id) => listed.includes(id as LogoStudioSectorId))
}

export const LOGO_STUDIO_METAL_TONES = METAL_TONE_IDS

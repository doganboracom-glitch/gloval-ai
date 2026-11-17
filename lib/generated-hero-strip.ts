import {
  clampHeroStripText,
  clampHeroStripTitle,
  heroStripPlacementIndex,
  isUnverifiableHeroStripClaim,
  resolveHeroStripIcon,
  type HeroStripItemLike,
} from '@/lib/hero-strip'
import { HERO_STRIP_ITEM_COUNT } from '@/lib/list-limits'
import type { Section, WebsiteSchema } from '@/lib/website-schema'

/**
 * Newly generated sites always ship the floating "Slider Altı Kutu" strip right under the hero.
 * The model is not asked to write it; when it still returns one, its boxes are kept (minus any
 * unverifiable claim) and only the layout is forced. Existing sites are never passed through here:
 * an omitted `variant` keeps rendering the original full-width strip.
 */

type Box = readonly [icon: string, title: string, text: string]

/** Neutral and truthful on purpose: no numbers, percentages, years or superlatives. */
export const GENERATED_HERO_STRIP_FALLBACK: Record<'tr' | 'en', readonly Box[]> = {
  tr: [
    ['clock', 'Hızlı Dönüş', 'Talebinize hızlı yanıt'],
    ['badge-check', 'Net Teklif', 'Şeffaf ve anlaşılır fiyat'],
    ['phone', 'Kolay İletişim', 'Telefon ve WhatsApp ile ulaşın'],
    ['shield-check', 'Güvenilir Hizmet', 'İşinizi özenle yapıyoruz'],
  ],
  en: [
    ['clock', 'Quick Response', 'We reply to your request fast'],
    ['badge-check', 'Clear Quote', 'Transparent, easy-to-read pricing'],
    ['phone', 'Easy Contact', 'Reach us by phone or WhatsApp'],
    ['shield-check', 'Reliable Service', 'We take care with your job'],
  ],
}

export function generatedHeroStripFallbackItems(lang: 'tr' | 'en'): HeroStripItemLike[] {
  return GENERATED_HERO_STRIP_FALLBACK[lang].map(([icon, title, text]) => ({ icon, title, text }))
}

type StripSection = Extract<Section, { type: 'heroStrip' }>

function isUsable(item: HeroStripItemLike | undefined): item is HeroStripItemLike {
  if (!item) return false
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  const text = typeof item.text === 'string' ? item.text.trim() : ''
  if (!title && !text) return false
  return !isUnverifiableHeroStripClaim(title) && !isUnverifiableHeroStripClaim(text)
}

/** Exactly four boxes: the model's usable ones first, the neutral fallback for the rest. */
function normalizeItems(items: readonly HeroStripItemLike[], lang: 'tr' | 'en'): HeroStripItemLike[] {
  const fallback = generatedHeroStripFallbackItems(lang)
  const kept = items.filter(isUsable).slice(0, HERO_STRIP_ITEM_COUNT)
  const usedTitles = new Set(kept.map((item) => item.title.trim().toLocaleLowerCase(lang)))
  const fill = fallback.filter((item) => !usedTitles.has(item.title.toLocaleLowerCase(lang)))
  return [...kept, ...fill].slice(0, HERO_STRIP_ITEM_COUNT).map((item) => ({
    icon: resolveHeroStripIcon(item.icon),
    title: clampHeroStripTitle(item.title.trim()),
    text: clampHeroStripText(item.text.trim()),
  }))
}

/**
 * Guarantees one `heroStrip` right after the opening hero / slider run, with exactly four boxes and
 * `variant: 'floating'`. Pure: returns a new schema and leaves the input untouched.
 */
export function ensureGeneratedHeroStrip(site: WebsiteSchema, lang: 'tr' | 'en'): WebsiteSchema {
  const existing = site.sections.find((s): s is StripSection => s.type === 'heroStrip')
  const others = site.sections.filter((s) => s.type !== 'heroStrip')
  const strip: StripSection = {
    ...(existing ?? { type: 'heroStrip' as const }),
    variant: 'floating',
    sample: undefined,
    items: normalizeItems(existing?.items ?? [], lang),
  }
  const sections: WebsiteSchema['sections'] = [...others]
  sections.splice(heroStripPlacementIndex(sections), 0, strip)
  return { ...site, sections }
}
